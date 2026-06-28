import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireOrganizer } from "@/lib/organizer-guard";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireOrganizer();
  if (guard.error) return guard.error;
  const { userId } = guard;

  const { id } = await params;

  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  if (event.organizerId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(event);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireOrganizer();
  if (guard.error) return guard.error;
  const { userId } = guard;

  const { id } = await params;
  const body = await req.json();
  const { title, description, venue, date, capacity, price } = body;

  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  if (event.organizerId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Capacity may never drop below the seats already confirmed.
  if (capacity !== undefined) {
    const cap = Number(capacity);
    if (!Number.isInteger(cap) || cap < 1) {
      return NextResponse.json(
        { error: "Capacity must be a whole number of at least 1" },
        { status: 400 }
      );
    }
    const confirmedCount = await prisma.booking.count({
      where: { eventId: id, status: "confirmed" },
    });
    if (cap < confirmedCount) {
      return NextResponse.json(
        {
          error: `Capacity cannot be less than current confirmed bookings (${confirmedCount})`,
        },
        { status: 400 }
      );
    }
  }

  if (price !== undefined && (!Number.isFinite(Number(price)) || Number(price) < 0)) {
    return NextResponse.json(
      { error: "Price cannot be negative" },
      { status: 400 }
    );
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

  return NextResponse.json(updated);
}
