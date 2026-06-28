import { NextRequest } from "next/server";
import { proxy } from "@/lib/backend";

// Thin proxy → Express `GET /api/events/:id`. Public; the backend logs
// `event_viewed` using the forwarded session token (anonymous if none).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return proxy(req, `/api/events/${encodeURIComponent(id)}`);
}
