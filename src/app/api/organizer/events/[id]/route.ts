import { NextRequest } from "next/server";
import { proxy } from "@/lib/backend";

// Thin proxy → Express `GET /api/organizer/events/:id` (owner only).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return proxy(req, `/api/organizer/events/${encodeURIComponent(id)}`);
}

// Thin proxy → Express `PATCH /api/organizer/events/:id` (capacity floor
// enforced in the backend).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return proxy(req, `/api/organizer/events/${encodeURIComponent(id)}`);
}
