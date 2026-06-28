"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

interface Event {
  id: string;
  title: string;
  venue: string;
  date: string;
  price: number;
  seatsRemaining: number;
  soldOut: boolean;
  organizer: string;
}

function EventsList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [events, setEvents] = useState<Event[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState(
    searchParams.get("search") || ""
  );

  const page = parseInt(searchParams.get("page") || "1");
  const search = searchParams.get("search") || "";
  const date = searchParams.get("date") || "";

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (date) params.set("date", date);
      params.set("page", page.toString());

      try {
        const res = await fetch(`/api/events?${params}`);
        const data = await res.json();
        if (cancelled) return; // a newer request superseded this one
        setEvents(data.events || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
      } catch {
        // Keep the previous results if a request fails.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [page, search, date]);

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([k, v]) => {
        if (v) params.set(k, v);
        else params.delete(k);
      });
      // Changing a filter (search/date) jumps back to page 1; navigating
      // pages keeps the requested page number.
      if (!("page" in updates)) {
        params.set("page", "1");
      }
      router.push(`/events?${params}`);
    },
    [searchParams, router]
  );

  // Debounce the search box: push the search param 400ms after typing stops.
  useEffect(() => {
    if (searchInput === search) return;
    const timer = setTimeout(() => updateParams({ search: searchInput }), 400);
    return () => clearTimeout(timer);
  }, [searchInput, search, updateParams]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
        Upcoming Events
      </h1>

      {/* Search + Filter */}
      <div className="flex gap-3 mb-6">
        <input
          type="text"
          placeholder="Search events..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="date"
          defaultValue={date}
          onChange={(e) => updateParams({ date: e.target.value })}
          onClick={(e) => {
            // Open the native calendar on a click anywhere in the field,
            // not just the (hard-to-see) calendar icon. Guarded because
            // clicking the icon itself can double-trigger showPicker().
            try {
              e.currentTarget.showPicker();
            } catch {}
          }}
          className="border border-gray-300 rounded-md px-3 py-2 bg-white text-gray-900 scheme-light cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {(search || date) && (
          <button
            onClick={() => {
              setSearchInput("");
              updateParams({ search: "", date: "" });
            }}
            className="px-3 py-2 text-sm text-gray-500 border border-gray-300
                       rounded-md hover:bg-gray-50"
          >
            Clear
          </button>
        )}
      </div>

      {!loading && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{total} events found</p>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">
          Loading events...
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No events found</div>
      ) : (
        <div className="grid gap-4">
          {events.map((event) => (
            <Link
              key={event.id}
              href={`/events/${event.id}`}
              className="block bg-white border border-gray-200 rounded-lg p-5
                         hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-lg font-semibold text-gray-900">
                      {event.title}
                    </h2>
                    {event.soldOut && (
                      <span
                        className="bg-red-100 text-red-700 text-xs
                                         font-medium px-2 py-0.5 rounded-full"
                      >
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
                    by {event.organizer}
                  </p>
                </div>
                <div className="text-right ml-4 flex-shrink-0">
                  <p className="text-lg font-bold text-gray-900">
                    {event.price === 0 ? "Free" : `₹${event.price}`}
                  </p>
                  <p
                    className={`text-sm mt-1 ${
                      event.soldOut
                        ? "text-red-500"
                        : event.seatsRemaining <= 5
                        ? "text-orange-500"
                        : "text-green-600"
                    }`}
                  >
                    {event.soldOut
                      ? "No seats left"
                      : `${event.seatsRemaining} seats left`}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-8">
          <button
            onClick={() => updateParams({ page: (page - 1).toString() })}
            disabled={page === 1}
            className="px-4 py-2 border rounded-md disabled:opacity-40
                       hover:bg-gray-50"
          >
            Previous
          </button>
          <span className="px-4 py-2 text-gray-600">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => updateParams({ page: (page + 1).toString() })}
            disabled={page === totalPages}
            className="px-4 py-2 border rounded-md disabled:opacity-40
                       hover:bg-gray-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

// Suspense wrapper required by Next.js 14 for useSearchParams
export default function EventsPage() {
  return (
    <Suspense
      fallback={
        <div className="text-center py-12 text-gray-500">Loading...</div>
      }
    >
      <EventsList />
    </Suspense>
  );
}