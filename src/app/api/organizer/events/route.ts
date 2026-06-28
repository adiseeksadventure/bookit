import { NextRequest } from "next/server";
import { proxy } from "@/lib/backend";

// Thin proxy → Express `GET /api/organizer/events` (organizer's events + sold
// counts). The backend enforces the organizer role.
export async function GET(req: NextRequest) {
  return proxy(req, "/api/organizer/events");
}

// Thin proxy → Express `POST /api/organizer/events` (create event).
export async function POST(req: NextRequest) {
  return proxy(req, "/api/organizer/events");
}
