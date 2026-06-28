import { NextRequest } from "next/server";
import { proxy } from "@/lib/backend";

// Thin proxy → Express `DELETE /api/bookings/:id` (cancel + free the seat).
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return proxy(req, `/api/bookings/${encodeURIComponent(id)}`);
}
