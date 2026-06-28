import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { asyncHandler, requireAuth } from "../lib/middleware";

export const eventsRouter = Router();

// GET /api/events — browse: search + date + page. Verbatim port of
// `src/app/api/events/route.ts`. Indexed SQL pagination (findMany + count run in
// parallel); nothing is filtered in JS (NOTES §4).
eventsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const search = (req.query.search as string) || "";
    const date = (req.query.date as string) || "";
    const page = parseInt((req.query.page as string) || "1");
    const pageSize = 20;

    const where: Prisma.EventWhereInput = {};

    // Upcoming events — only apply if no specific date filter
    if (!date) {
      where.date = { gte: new Date() };
    }

    if (search) {
      where.title = { contains: search, mode: "insensitive" };
    }

    if (date) {
      const start = new Date(date);
      const end = new Date(date);
      end.setDate(end.getDate() + 1);
      where.date = { gte: start, lt: end };
    }

    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { date: "asc" },
        include: {
          _count: {
            select: { bookings: { where: { status: "confirmed" } } },
          },
          organizer: { select: { name: true } },
        },
      }),
      prisma.event.count({ where }),
    ]);

    const eventsWithSeats = events.map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      venue: e.venue,
      date: e.date,
      capacity: e.capacity,
      price: e.price,
      organizer: e.organizer.name,
      seatsRemaining: e.capacity - e._count.bookings,
      soldOut: e._count.bookings >= e.capacity,
    }));

    res.json({
      events: eventsWithSeats,
      total,
      page,
      totalPages: Math.ceil(total / pageSize),
    });
  })
);

// POST /api/events/:id/book — the concurrency-critical endpoint. Verbatim port
// of `src/app/api/events/[id]/book/route.ts`. `requireAuth` supplies req.user
// (proxy.ts protected POST /api/events). The locking strategy is unchanged: a
// `SELECT … FOR UPDATE` row lock inside a single transaction (NOTES §2).

// Typed domain errors so we branch on a `code`, never on `Error.message`.
class BookingError extends Error {
  constructor(
    public code: "EVENT_NOT_FOUND" | "EVENT_PAST" | "SOLD_OUT" | "ALREADY_BOOKED"
  ) {
    super(code);
  }
}

eventsRouter.post(
  "/:id/book",
  requireAuth,
  asyncHandler(async (req, res) => {
    const eventId = String(req.params.id);
    const userId = req.user!.id;

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
          //    seat). Checked before capacity for that reason.
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
          //    respects the unique constraint AND lets a user re-book.
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

      res.status(201).json({ bookingId: booking.id, status: booking.status });
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
        res.status(map.status).json({ error: map.msg });
        return;
      }

      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        // Same-user double-book slipped past the app check (e.g. double-click) —
        // the unique constraint is the DB-level backstop for that case.
        if (err.code === "P2002") {
          res
            .status(409)
            .json({ error: "You have already booked this event" });
          return;
        }
        // Serialization failure / deadlock — a clean, retryable signal, not 500.
        if (err.code === "P2034") {
          res
            .status(409)
            .json({ error: "High demand right now — please try again" });
          return;
        }
      }

      console.error("Booking error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  })
);

// GET /api/events/:id — detail (+ logs event_viewed). Verbatim port of
// `src/app/api/events/[id]/route.ts`. The viewer id comes from req.user, which
// is optional here — anonymous (logged-out) views still log a row (NOTES §3.4).
eventsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);

    const event = await prisma.event.findUnique({
      where: { id },
      include: {
        _count: {
          select: { bookings: { where: { status: "confirmed" } } },
        },
        organizer: { select: { name: true } },
      },
    });

    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    // Fire-and-forget activity log — userId is undefined for anonymous viewers.
    prisma.activityLog
      .create({
        data: {
          eventId: event.id,
          userId: req.user?.id,
          type: "event_viewed",
        },
      })
      .catch(() => {});

    res.json({
      id: event.id,
      title: event.title,
      description: event.description,
      venue: event.venue,
      date: event.date,
      capacity: event.capacity,
      price: event.price,
      organizer: event.organizer.name,
      organizerId: event.organizerId,
      seatsRemaining: event.capacity - event._count.bookings,
      soldOut: event._count.bookings >= event.capacity,
    });
  })
);
