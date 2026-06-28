"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Attendee {
  bookingId: string;
  bookedAt: string;
  user: { id: string; name: string; email: string };
}

export default function AttendeesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [eventId, setEventId] = useState<string | null>(null);
  const [eventTitle, setEventTitle] = useState("");
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");

  useEffect(() => {
    params.then(({ id }) => setEventId(id));
  }, [params]);

  useEffect(() => {
    if (!eventId) return;
    fetch(`/api/organizer/events/${eventId}/attendees`)
      .then((r) => r.json())
      .then((data) => {
        setEventTitle(data.eventTitle ?? "");
        setAttendees(data.attendees ?? []);
        setLoading(false);
      })
      .catch(() => {
        setFetchError("Failed to load attendees");
        setLoading(false);
      });
  }, [eventId]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 text-gray-500 dark:text-gray-400">
        Loading attendees...
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 text-red-500">
        {fetchError}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/organizer" className="text-blue-600 hover:underline text-sm">
          ← Back to dashboard
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mt-2">
          Attendees — {eventTitle}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {attendees.length} confirmed booking
          {attendees.length !== 1 ? "s" : ""}
        </p>
      </div>

      {attendees.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          No confirmed bookings yet.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-700">
                  Name
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">
                  Email
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">
                  Booked At
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {attendees.map((a) => (
                <tr key={a.bookingId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900">{a.user.name}</td>
                  <td className="px-4 py-3 text-gray-600">{a.user.email}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(a.bookedAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
