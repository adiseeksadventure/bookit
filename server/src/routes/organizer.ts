import { Router } from "express";
import { prisma } from "../db";
import { asyncHandler } from "../lib/middleware";

// All routes here are mounted behind `requireOrganizer` (401 if not signed in,
// 403 if not an organizer). Each handler ALSO re-checks ownership
// (event.organizerId === req.user.id) — role and ownership are separate
// concerns (NOTES §5). Verbatim ports of `src/app/api/organizer/**`.
export const organizerRouter = Router();

// GET /api/organizer/events — organizer's events + sold counts.
organizerRouter.get(
  "/events",
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;

    const events = await prisma.event.findMany({
      where: { organizerId: userId },
      orderBy: { date: "desc" },
      include: {
        _count: {
          select: { bookings: { where: { status: "confirmed" } } },
        },
      },
    });

    res.json({
      events: events.map((e) => ({
        id: e.id,
        title: e.title,
        description: e.description,
        venue: e.venue,
        date: e.date,
        capacity: e.capacity,
        price: e.price,
        soldCount: e._count.bookings,
        seatsRemaining: e.capacity - e._count.bookings,
        soldOut: e._count.bookings >= e.capacity,
      })),
    });
  })
);

// POST /api/organizer/events — create event.
organizerRouter.post(
  "/events",
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;

    const { title, description, venue, date, capacity, price } = req.body ?? {};

    if (
      !title ||
      !description ||
      !venue ||
      !date ||
      capacity === undefined ||
      price === undefined
    ) {
      res.status(400).json({ error: "All fields are required" });
      return;
    }

    const cap = Number(capacity);
    const pr = Number(price);

    if (!Number.isInteger(cap) || cap < 1) {
      res
        .status(400)
        .json({ error: "Capacity must be a whole number of at least 1" });
      return;
    }
    if (!Number.isFinite(pr) || pr < 0) {
      res.status(400).json({ error: "Price cannot be negative" });
      return;
    }
    if (new Date(date) < new Date()) {
      res.status(400).json({ error: "Event date must be in the future" });
      return;
    }

    const event = await prisma.event.create({
      data: {
        title,
        description,
        venue,
        date: new Date(date),
        capacity: cap,
        price: pr,
        organizerId: userId,
      },
    });

    res.status(201).json(event);
  })
);

// GET /api/organizer/events/:id — single event (owner only).
organizerRouter.get(
  "/events/:id",
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const id = String(req.params.id);

    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    if (event.organizerId !== userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    res.json(event);
  })
);

// PATCH /api/organizer/events/:id — edit (capacity floor enforced).
organizerRouter.patch(
  "/events/:id",
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const id = String(req.params.id);
    const { title, description, venue, date, capacity, price } = req.body ?? {};

    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    if (event.organizerId !== userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // Capacity may never drop below the seats already confirmed.
    if (capacity !== undefined) {
      const cap = Number(capacity);
      if (!Number.isInteger(cap) || cap < 1) {
        res
          .status(400)
          .json({ error: "Capacity must be a whole number of at least 1" });
        return;
      }
      const confirmedCount = await prisma.booking.count({
        where: { eventId: id, status: "confirmed" },
      });
      if (cap < confirmedCount) {
        res.status(400).json({
          error: `Capacity cannot be less than current confirmed bookings (${confirmedCount})`,
        });
        return;
      }
    }

    if (
      price !== undefined &&
      (!Number.isFinite(Number(price)) || Number(price) < 0)
    ) {
      res.status(400).json({ error: "Price cannot be negative" });
      return;
    }

    const updated = await prisma.event.update({
      where: { id },
      data: {
        ...(title && { title }),
        ...(description && { description }),
        ...(venue && { venue }),
        ...(date && { date: new Date(date) }),
        ...(capacity !== undefined && { capacity: Number(capacity) }),
        ...(price !== undefined && { price: Number(price) }),
      },
    });

    res.json(updated);
  })
);

// GET /api/organizer/events/:id/attendees — attendee list.
organizerRouter.get(
  "/events/:id/attendees",
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const id = String(req.params.id);

    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    if (event.organizerId !== userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const bookings = await prisma.booking.findMany({
      where: { eventId: id, status: "confirmed" },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    res.json({
      eventTitle: event.title,
      attendees: bookings.map((b) => ({
        bookingId: b.id,
        bookedAt: b.createdAt,
        user: b.user,
      })),
      total: bookings.length,
    });
  })
);

// GET /api/organizer/events/:id/analytics — analytics from activity_log.
organizerRouter.get(
  "/events/:id/analytics",
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const id = String(req.params.id);

    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    if (event.organizerId !== userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // Aggregate the append-only activity_log in the DB (GROUP BY type).
    const logs = await prisma.activityLog.groupBy({
      by: ["type"],
      where: { eventId: id },
      _count: { type: true },
    });

    const counts: Record<string, number> = {};
    logs.forEach((l) => {
      counts[l.type] = l._count.type;
    });

    const views = counts["event_viewed"] ?? 0;
    const started = counts["booking_started"] ?? 0;
    const confirmed = counts["booking_confirmed"] ?? 0;
    const cancelled = counts["booking_cancelled"] ?? 0;
    // View → booking conversion = confirmed bookings / views; guard divide-by-zero.
    const conversionRate =
      views === 0 ? 0 : Math.round((confirmed / views) * 100);

    res.json({
      eventId: id,
      eventTitle: event.title,
      views,
      bookingStarted: started,
      bookingConfirmed: confirmed,
      bookingCancelled: cancelled,
      conversionRate,
    });
  })
);
