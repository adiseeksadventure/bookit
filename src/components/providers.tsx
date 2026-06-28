"use client";

import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";

// Wraps the app so client components can call `useSession()`. The initial
// `session` comes from the server (via `auth()` in the root layout) so the
// nav renders the correct signed-in/out state on first paint — no flicker.
export function Providers({
  children,
  session,
}: {
  children: React.ReactNode;
  session: Session | null;
}) {
  return <SessionProvider session={session}>{children}</SessionProvider>;
}
