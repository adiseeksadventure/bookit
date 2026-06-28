"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";

export function Navbar() {
  const { data: session, status } = useSession();
  const pathname = usePathname();

  // Keep the auth screens clean — no nav on login/signup.
  if (pathname === "/login" || pathname === "/signup") return null;

  const isAuthed = status === "authenticated";
  const isOrganizer = session?.user?.role === "organizer";

  const linkClass = (href: string) =>
    `text-sm hover:text-blue-600 ${
      pathname === href || pathname.startsWith(href + "/")
        ? "text-blue-600 font-medium"
        : "text-gray-600"
    }`;

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
      <nav className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/events" className="text-lg font-bold text-gray-900">
          Book<span className="text-blue-600">It</span>
        </Link>

        <div className="flex items-center gap-4">
          <Link href="/events" className={linkClass("/events")}>
            Events
          </Link>

          {isAuthed && (
            <Link href="/me" className={linkClass("/me")}>
              My Bookings
            </Link>
          )}

          {isAuthed && isOrganizer && (
            <Link href="/organizer" className={linkClass("/organizer")}>
              Dashboard
            </Link>
          )}

          {status === "loading" ? null : isAuthed ? (
            <div className="flex items-center gap-3 pl-3 border-l border-gray-200">
              <span className="text-sm text-gray-500 hidden sm:inline">
                {session.user?.name}
              </span>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="text-sm text-gray-600 hover:text-red-600"
              >
                Sign out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3 pl-3 border-l border-gray-200">
              <Link
                href="/login"
                className="text-sm text-gray-600 hover:text-blue-600"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 font-medium"
              >
                Sign up
              </Link>
            </div>
          )}
        </div>
      </nav>
    </header>
  );
}
