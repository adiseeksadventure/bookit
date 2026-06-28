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
  // Conversion = confirmed / started; guard against divide-by-zero.
  const conversionRate =
    started === 0 ? 0 : Math.round((confirmed / started) * 100);

  return NextResponse.json({
    eventId: id,
    eventTitle: event.title,
    views,
    bookingStarted: started,
    bookingConfirmed: confirmed,
    bookingCancelled: cancelled,
    conversionRate,
  });
}
