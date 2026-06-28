import { NextRequest } from "next/server";
import { proxy } from "@/lib/backend";

// Thin proxy → Express `POST /api/events/:id/book` (the concurrency-critical
// endpoint; the FOR UPDATE transaction lives in the backend). Requires a
// session — the forwarded token is what authenticates the booking.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return proxy(req, `/api/events/${encodeURIComponent(id)}/book`);
}
