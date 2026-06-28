import { NextRequest } from "next/server";
import { proxy } from "@/lib/backend";

// Thin proxy → Express `GET /api/organizer/events/:id/analytics` (computed from
// the activity_log in the backend).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return proxy(req, `/api/organizer/events/${encodeURIComponent(id)}/analytics`);
}
