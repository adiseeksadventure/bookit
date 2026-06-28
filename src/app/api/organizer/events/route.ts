import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireOrganizer } from "@/lib/organizer-guard";

export async function GET() {
  const guard = await requireOrganizer();
  if (guard.error) return guard.error;
  const { userId } = guard;

  const events = await prisma.event.findMany({
    where: { organizerId: userId },
    orderBy: { date: "desc" },
    include: {
      _count: {
        select: { bookings: { where: { status: "confirmed" } } },
      },
    },
  });

  return NextResponse.json({
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
}

export async function POST(req: NextRequest) {
  const guard = await requireOrganizer();
  if (guard.error) return guard.error;
  const { userId } = guard;

  const body = await req.json();
  const { title, description, venue, date, capacity, price } = body;

  if (
    !title ||
    !description ||
    !venue ||
    !date ||
    capacity === undefined ||
    price === undefined
  ) {
    return NextResponse.json(
      { error: "All fields are required" },
      { status: 400 }
    );
  }

  const cap = Number(capacity);
  const pr = Number(price);

  if (!Number.isInteger(cap) || cap < 1) {
    return NextResponse.json(
      { error: "Capacity must be a whole number of at least 1" },
      { status: 400 }
    );
  }
  if (!Number.isFinite(pr) || pr < 0) {
    return NextResponse.json(
      { error: "Price cannot be negative" },
      { status: 400 }
    );
  }
  if (new Date(date) < new Date()) {
    return NextResponse.json(
      { error: "Event date must be in the future" },
      { status: 400 }
    );
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

  return NextResponse.json(event, { status: 201 });
}
