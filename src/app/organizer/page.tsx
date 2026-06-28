"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface OrgEvent {
  id: string;
  title: string;
  venue: string;
  date: string;
  capacity: number;
  price: number;
  soldCount: number;
  seatsRemaining: number;
  soldOut: boolean;
}

export default function OrganizerDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [events, setEvents] = useState<OrgEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (session?.user?.role !== "organizer") {
      router.push("/events");
      return;
    }

    fetch("/api/organizer/events")
      .then((r) => r.json())
      .then((data) => {
        setEvents(data.events ?? []);
        setLoading(false);
      })
      .catch(() => {
        setFetchError("Failed to load events. Please refresh.");
        setLoading(false);
      });
  }, [status, session, router]);

  if (status === "loading" || loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 text-gray-500 dark:text-gray-400">
        Loading dashboard...
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 text-red-500">
        {fetchError}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Organizer Dashboard
        </h1>
        <Link
          href="/organizer/events/new"
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 font-medium text-sm"
        >
          + Create Event
        </Link>
      </div>

      {events.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <p className="mb-4">You haven&apos;t created any events yet.</p>
          <Link
            href="/organizer/events/new"
            className="text-blue-600 hover:underline font-medium"
          >
            Create your first event →
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {events.map((event) => (
            <div
              key={event.id}
              className="bg-white border border-gray-200 rounded-lg p-5"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-lg font-semibold text-gray-900">
                      {event.title}
                    </h2>
                    {event.soldOut && (
                      <span className="bg-red-100 text-red-700 text-xs font-medium px-2 py-0.5 rounded-full">
                        Sold Out
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">
                    {event.venue} ·{" "}
                    {new Date(event.date).toLocaleDateString("en-IN", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                  <p className="text-sm text-gray-400 mt-1">
                    {event.soldCount} / {event.capacity} booked ·{" "}
                    {event.price === 0 ? "Free" : `₹${event.price}`}
                  </p>
                </div>

                <div className="flex gap-2 ml-4 flex-shrink-0 text-sm">
                  <Link
                    href={`/organizer/events/${event.id}/analytics`}
                    className="text-blue-600 hover:underline"
                  >
                    Analytics
                  </Link>
                  <span className="text-gray-300">·</span>
                  <Link
                    href={`/organizer/events/${event.id}/attendees`}
                    className="text-blue-600 hover:underline"
                  >
                    Attendees
                  </Link>
                  <span className="text-gray-300">·</span>
                  <Link
                    href={`/organizer/events/${event.id}/edit`}
                    className="text-blue-600 hover:underline"
                  >
                    Edit
                  </Link>
                </div>
              </div>

              <div className="mt-3">
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div
                    className="bg-blue-500 h-1.5 rounded-full transition-all"
                    style={{
                      width: `${Math.min(
                        (event.soldCount / event.capacity) * 100,
                        100
                      )}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
