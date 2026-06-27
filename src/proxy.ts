// NOTE: In Next.js 16 the `middleware` file convention was deprecated and
// renamed to `proxy` (it runs on the Node.js runtime). So this file lives at
// `src/proxy.ts` rather than `src/middleware.ts`. The logic is the same:
// it runs before a request is handled and can redirect unauthenticated users.
//
// `auth` from our config wraps the handler and adds `req.auth`, which holds
// the decoded session when the user is signed in, or `null` when they are not.
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;

  // Routes that require a signed-in user. Creating an event (POST /api/events)
  // is protected, but browsing events (GET /api/events) stays public.
  const isProtected =
    pathname.startsWith("/me") ||
    pathname.startsWith("/organizer") ||
    pathname.startsWith("/api/me") ||
    pathname.startsWith("/api/organizer") ||
    pathname.startsWith("/api/bookings") ||
    (pathname.startsWith("/api/events") && req.method === "POST");

  if (isProtected && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  // Run on every route except Next.js internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
