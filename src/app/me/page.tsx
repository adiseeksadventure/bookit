"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Booking {
  id: string;
  status: string;
  createdAt: string;
  event: {
    id: string;
    title: string;
    venue: string;
    date: string;
    price: number;
  };
}

export default function MyBookingsPage() {
  const { status } = useSession();
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [cancelling, setCancelling] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (status === "authenticated") {
      fetch("/api/me/bookings")
        .then(async (r) => {
          // A failed request must surface as an error, not an empty list.
          if (!r.ok) throw new Error();
          return r.json();
        })
        .then((data) => {
          setBookings(data.bookings || []);
          setLoading(false);
        })
        .catch(() => {
          setLoadError("We couldn't load your bookings. Please refresh.");
          setLoading(false);
        });
    }
  }, [status, router]);

  async function handleCancel(bookingId: string) {
    if (!confirm("Cancel this booking? The seat will be freed.")) return;
    setCancelling(bookingId);

    const res = await fetch(`/api/bookings/${bookingId}`, {
      method: "DELETE",
    });

    if (res.ok) {
      setBookings((prev) =>
        prev.map((b) =>
          b.id === bookingId ? { ...b, status: "cancelled" } : b
        )
      );
    } else {
      const data = await res.json();
      alert(data.error || "Failed to cancel booking");
    }
    setCancelling(null);
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 text-gray-500 dark:text-gray-400">
        Loading your bookings...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 text-red-500">
        {loadError}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
        My Bookings
      </h1>

      {bookings.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <p className="mb-4">You haven&apos;t booked any events yet.</p>
          <Link
            href="/events"
            className="text-blue-600 hover:underline font-medium"
          >
            Browse events →
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {bookings.map((booking) => (
            <div
              key={booking.id}
              className={`bg-white border rounded-lg p-5 ${
                booking.status === "cancelled"
                  ? "border-gray-200 opacity-60"
                  : "border-gray-200"
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Link
                      href={`/events/${booking.event.id}`}
                      className="text-lg font-semibold text-gray-900 hover:text-blue-600"
                    >
                      {booking.event.title}
                    </Link>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        booking.status === "confirmed"
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {booking.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500">
                    {booking.event.venue} ·{" "}
                    {new Date(booking.event.date).toLocaleDateString("en-IN", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                  <p className="text-sm text-gray-400 mt-1">
                    {booking.event.price === 0
                      ? "Free"
                      : `₹${booking.event.price}`}
                  </p>
                </div>

                {booking.status === "confirmed" && (
                  <button
                    onClick={() => handleCancel(booking.id)}
                    disabled={cancelling === booking.id}
                    className="text-sm text-red-500 hover:text-red-700 disabled:opacity-50 ml-4 flex-shrink-0"
                  >
                    {cancelling === booking.id ? "Cancelling..." : "Cancel"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
