import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

type OrganizerGuardResult =
  | { error: NextResponse; userId: null }
  | { error: null; userId: string };

// Shared guard for every organizer-only route. Uses `auth()` (the NextAuth v5
// idiom) rather than `getToken`, matching the rest of the codebase and avoiding
// the prod secure-cookie pitfall. Returns either a ready-to-send error response
// or the authenticated organizer's id.
export async function requireOrganizer(): Promise<OrganizerGuardResult> {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      userId: null,
    };
  }

  if (session.user.role !== "organizer") {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      userId: null,
    };
  }

  return { error: null, userId: session.user.id };
}
