import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getToken } from "next-auth/jwt";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

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
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // Fire-and-forget activity log — use undefined not null for optional userId
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  prisma.activityLog
    .create({
      data: {
        eventId: event.id,
        userId: token?.id as string | undefined,
        type: "event_viewed",
      },
    })
    .catch(() => {});

  return NextResponse.json({
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
}