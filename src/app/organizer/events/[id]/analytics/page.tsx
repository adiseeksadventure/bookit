"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Analytics {
  eventTitle: string;
  views: number;
  bookingStarted: number;
  bookingConfirmed: number;
  bookingCancelled: number;
  conversionRate: number;
}

export default function AnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [eventId, setEventId] = useState<string | null>(null);
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");

  useEffect(() => {
    params.then(({ id }) => setEventId(id));
  }, [params]);

  useEffect(() => {
    if (!eventId) return;
    fetch(`/api/organizer/events/${eventId}/analytics`)
      .then(async (r) => {
        // Don't render an error body as analytics — route it to the error UI.
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        setFetchError("Failed to load analytics");
        setLoading(false);
      });
  }, [eventId]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 text-gray-500 dark:text-gray-400">
        Loading analytics...
      </div>
    );
  }

  if (fetchError || !data) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 text-red-500">
        {fetchError || "No data available"}
      </div>
    );
  }

  const stats = [
    { label: "Total Views", value: data.views },
    { label: "Bookings Started", value: data.bookingStarted },
    { label: "Bookings Confirmed", value: data.bookingConfirmed },
    { label: "Bookings Cancelled", value: data.bookingCancelled },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/organizer" className="text-blue-600 hover:underline text-sm">
          ← Back to dashboard
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mt-2">
          Analytics — {data.eventTitle}
        </h1>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-white border border-gray-200 rounded-lg p-5"
          >
            <p className="text-sm text-gray-500 mb-1">{stat.label}</p>
            <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <p className="text-sm text-gray-500 mb-1">
          View → Booking Conversion Rate
        </p>
        <p className="text-4xl font-bold text-blue-600">
          {data.conversionRate}%
        </p>
        <p className="text-xs text-gray-400 mt-2">
          {data.bookingConfirmed} booked out of {data.views} views
        </p>
        <div className="mt-3 w-full bg-gray-100 rounded-full h-2">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all"
            style={{ width: `${Math.min(data.conversionRate, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
