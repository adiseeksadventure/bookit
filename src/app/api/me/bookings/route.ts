import { NextRequest } from "next/server";
import { proxy } from "@/lib/backend";

// Thin proxy → Express `GET /api/me/bookings`.
export async function GET(req: NextRequest) {
  return proxy(req, "/api/me/bookings");
}
