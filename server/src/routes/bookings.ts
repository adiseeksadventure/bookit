import { Router } from "express";
import { prisma } from "../db";
import { asyncHandler } from "../lib/middleware";

export const bookingsRouter = Router();

// DELETE /api/bookings/:id — cancel (frees the seat). Verbatim port of
// `src/app/api/bookings/[id]/route.ts`. `requireAuth` is applied where this
// router is mounted, so req.user is always present here.
bookingsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const bookingId = String(req.params.id);
    const userId = req.user!.id;

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { userId: true, eventId: true },
    });

    if (!booking) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }
    if (booking.userId !== userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // Atomic flip: only succeeds if the booking is still confirmed. Guards
    // against a double-cancel race where two requests both read "confirmed"
    // and then both try to cancel.
    const { count } = await prisma.booking.updateMany({
      where: { id: bookingId, userId, status: "confirmed" },
      data: { status: "cancelled" },
    });

    if (count === 0) {
      res.status(409).json({ error: "Booking is already cancelled" });
      return;
    }

    // Cancelling drops the confirmed count, so the seat is freed automatically
    // (seats are always derived from confirmed bookings, never cached).
    void prisma.activityLog
      .create({
        data: { eventId: booking.eventId, userId, type: "booking_cancelled" },
      })
      .catch(() => {});

    res.status(200).json({ message: "Booking cancelled" });
  })
);
