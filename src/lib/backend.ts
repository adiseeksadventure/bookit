import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { auth } from "@/lib/auth";

// The Express backend is the only thing that talks to the database. In a
// production deployment it lives on a private network and the browser never
// reaches it directly — the Next.js route handlers under `src/app/api/**` are
// the public edge and forward to it. Configurable via BACKEND_URL.
export const BACKEND_URL =
  process.env.BACKEND_URL ?? "http://localhost:4000";

function backendSecret(): string {
  const s = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!s) {
    throw new Error(
      "AUTH_SECRET (or NEXTAUTH_SECRET) is required to sign backend tokens"
    );
  }
  return s;
}

// Translate the current Auth.js session into a short-lived bearer token the
// Express backend trusts: same secret and same payload shape as the backend's
// own `signSession`. Returns no header for anonymous requests (the backend then
// treats the call as logged-out, which is correct for public routes and yields
// a clean 401 on protected ones).
async function backendAuthHeader(): Promise<Record<string, string>> {
  const session = await auth();
  if (!session?.user?.id) return {};
  const token = jwt.sign(
    {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role,
    },
    backendSecret(),
    { expiresIn: 60 } // service token — only needs to survive this one hop
  );
  return { authorization: `Bearer ${token}` };
}

// Forward an incoming Next.js request to the Express backend and mirror its
// response (status, body, content-type) straight back to the caller. This keeps
// the Next route handlers thin and the frontend decoupled from the backend:
// the browser only ever sees Next.js URLs and Auth.js cookies.
export async function proxy(
  req: Request,
  backendPath: string
): Promise<NextResponse> {
  const headers: Record<string, string> = { ...(await backendAuthHeader()) };

  let body: string | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await req.text();
    if (body) {
      headers["content-type"] =
        req.headers.get("content-type") ?? "application/json";
    }
  }

  let res: Response;
  try {
    res = await fetch(BACKEND_URL + backendPath, {
      method: req.method,
      headers,
      body,
      cache: "no-store",
    });
  } catch {
    // Backend unreachable — fail closed with a clean 502 rather than a crash.
    return NextResponse.json(
      { error: "Backend service unavailable" },
      { status: 502 }
    );
  }

  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: {
      "content-type": res.headers.get("content-type") ?? "application/json",
    },
  });
}
