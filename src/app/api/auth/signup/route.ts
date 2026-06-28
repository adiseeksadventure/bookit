import { NextRequest } from "next/server";
import { proxy } from "@/lib/backend";

// Thin proxy → Express `POST /api/auth/signup`. Public (no session needed).
export async function POST(req: NextRequest) {
  return proxy(req, "/api/auth/signup");
}
