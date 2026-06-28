import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

// Typed domain errors so we branch on a `code`, never on `Error.message`.
class BookingError extends Error {
  constructor(
    public code: "EVENT_NOT_FOUND" | "EVENT_PAST" | "SOLD_OUT" | "ALREADY_BOOKED"
  ) {
    super(code);
  }
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  // Analytics: record the attempt. Best-effort — must never block or fail the
  // booking, so it runs outside the transaction and its errors are swallowed.
  void prisma.activityLog
    .create({ data: { eventId, userId, type: "booking_started" } })
    .catch(() => {});

  try {
    const booking = await prisma.$transaction(
      async (tx) => {
        // 1) Lock the event row. Every booking attempt for THIS event now
        //    queues behind this lock, so no two transactions can read a stale
        //    seat count. This is the single guarantee against overselling.
        const [event] = await tx.$queryRaw<
          { id: string; capacity: number; date: Date }[]
        >`SELECT id, capacity, date FROM "Event" WHERE id = ${eventId} FOR UPDATE`;

        if (!event) throw new BookingError("EVENT_NOT_FOUND");
        if (new Date(event.date) < new Date()) {
          throw new BookingError("EVENT_PAST");
        }

        // 2) Already holding a seat? Tell them so — even if the event is now
        //    full, "already booked" is the accurate message (they keep their
        //    seat). Checked before capacity for that reason. At most one row
        //    per (user, event), so this is a single lookup.
        const existing = await tx.booking.findUnique({
          where: { userId_eventId: { userId, eventId } },
        });
        if (existing?.status === "confirmed") {
          throw new BookingError("ALREADY_BOOKED");
        }

        // 3) Count confirmed bookings. Safe now — we hold the lock, so we see
        //    every booking committed before us.
        const confirmed = await tx.booking.count({
          where: { eventId, status: "confirmed" },
        });
        if (confirmed >= event.capacity) throw new BookingError("SOLD_OUT");

        // 4) Reactivate a cancelled booking instead of inserting a duplicate —
        //    respects the unique constraint AND lets a user re-book after
        //    cancelling.
        const result = existing
          ? await tx.booking.update({
              where: { id: existing.id },
              data: { status: "confirmed" },
            })
          : await tx.booking.create({
              data: { userId, eventId, status: "confirmed" },
            });

        // 5) Log the confirmation inside the transaction so it commits
        //    atomically with the booking and can never be lost.
        await tx.activityLog.create({
          data: { eventId, userId, type: "booking_confirmed" },
        });

        return result;
      },
      { timeout: 10_000 }
    );

    return NextResponse.json(
      { bookingId: booking.id, status: booking.status },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof BookingError) {
      const map = {
        EVENT_NOT_FOUND: { msg: "Event not found", status: 404 },
        EVENT_PAST: { msg: "This event has already started", status: 409 },
        SOLD_OUT: { msg: "Sorry, this event is sold out", status: 409 },
        ALREADY_BOOKED: {
          msg: "You have already booked this event",
          status: 409,
        },
      }[err.code];
      return NextResponse.json({ error: map.msg }, { status: map.status });
    }

    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      // Same-user double-book slipped past the app check (e.g. double-click) —
      // the unique constraint is the DB-level backstop for that case.
      if (err.code === "P2002") {
        return NextResponse.json(
          { error: "You have already booked this event" },
          { status: 409 }
        );
      }
      // Serialization failure / deadlock — a clean, retryable signal, not a 500.
      if (err.code === "P2034") {
        return NextResponse.json(
          { error: "High demand right now — please try again" },
          { status: 409 }
        );
      }
    }

    console.error("Booking error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
