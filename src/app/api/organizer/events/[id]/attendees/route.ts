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

  const bookings = await prisma.booking.findMany({
    where: { eventId: id, status: "confirmed" },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    eventTitle: event.title,
    attendees: bookings.map((b) => ({
      bookingId: b.id,
      bookedAt: b.createdAt,
      user: b.user,
    })),
    total: bookings.length,
  });
}
