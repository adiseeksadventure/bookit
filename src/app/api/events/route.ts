import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") || "";
  const date = searchParams.get("date") || "";
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = 20;

  const where: any = {};

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

  return NextResponse.json({
    events: eventsWithSeats,
    total,
    page,
    totalPages: Math.ceil(total / pageSize),
  });
}