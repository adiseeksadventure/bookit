import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bookingId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { userId: true, eventId: true },
  });

  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  if (booking.userId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Atomic flip: only succeeds if the booking is still confirmed. Guards
  // against a double-cancel race where two requests both read "confirmed"
  // and then both try to cancel.
  const { count } = await prisma.booking.updateMany({
    where: { id: bookingId, userId, status: "confirmed" },
    data: { status: "cancelled" },
  });

  if (count === 0) {
    return NextResponse.json(
      { error: "Booking is already cancelled" },
      { status: 409 }
    );
  }

  // Cancelling drops the confirmed count, so the seat is freed automatically
  // (seats are always derived from confirmed bookings, never cached).
  void prisma.activityLog
    .create({
      data: { eventId: booking.eventId, userId, type: "booking_cancelled" },
    })
    .catch(() => {});

  return NextResponse.json({ message: "Booking cancelled" }, { status: 200 });
}
