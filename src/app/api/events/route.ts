import { NextRequest } from "next/server";
import { proxy } from "@/lib/backend";

// Thin proxy → Express `GET /api/events` (search + date + page preserved via the
// original query string). Public.
export async function GET(req: NextRequest) {
  const { search } = new URL(req.url);
  return proxy(req, `/api/events${search}`);
}
