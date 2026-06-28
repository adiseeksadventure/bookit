"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface Event {
  id: string;
  title: string;
  description: string;
  venue: string;
  date: string;
  capacity: number;
  price: number;
  organizer: string;
  seatsRemaining: number;
  soldOut: boolean;
}

export default function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { data: session } = useSession();
  const router = useRouter();
  const [eventId, setEventId] = useState<string | null>(null);
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [message, setMessage] = useState("");

  // Await params first
  useEffect(() => {
    params.then(({ id }) => setEventId(id));
  }, [params]);

  useEffect(() => {
    if (!eventId) return;
    fetch(`/api/events/${eventId}`)
      .then((r) => r.json())
      .then((data) => {
        setEvent(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [eventId]);

  async function handleBook() {
    if (!session) {
      router.push("/login");
      return;
    }
    setBooking(true);
    setMessage("");

    const res = await fetch(`/api/events/${eventId}/book`, {
      method: "POST",
    });
    const data = await res.json();

    if (res.ok) {
      setMessage("Booking confirmed! 🎉");
      setEvent((e) =>
        e
          ? {
              ...e,
              seatsRemaining: e.seatsRemaining - 1,
              soldOut: e.seatsRemaining - 1 <= 0,
            }
          : e
      );
    } else {
      setMessage(data.error || "Something went wrong");
    }
    setBooking(false);
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 text-gray-500">
        Loading...
      </div>
    );
  }

  if (!event) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 text-gray-500">
        Event not found.
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <button
        onClick={() => router.back()}
        className="text-blue-600 hover:underline text-sm mb-6 block"
      >
        ← Back to events
      </button>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex justify-between items-start mb-4">
          <h1 className="text-2xl font-bold text-gray-900">{event.title}</h1>
          {event.soldOut && (
            <span
              className="bg-red-100 text-red-700 text-sm font-medium
                           px-3 py-1 rounded-full"
            >
              Sold Out
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6 text-sm text-gray-600">
          <div>
            <p className="font-medium text-gray-900">Date & Time</p>
            <p>
              {new Date(event.date).toLocaleString("en-IN", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
          <div>
            <p className="font-medium text-gray-900">Venue</p>
            <p>{event.venue}</p>
          </div>
          <div>
            <p className="font-medium text-gray-900">Organizer</p>
            <p>{event.organizer}</p>
          </div>
          <div>
            <p className="font-medium text-gray-900">Price</p>
            <p>{event.price === 0 ? "Free" : `₹${event.price}`}</p>
          </div>
        </div>

        <div className="mb-6">
          <p className="font-medium text-gray-900 mb-1">About this event</p>
          <p className="text-gray-600">{event.description}</p>
        </div>

        <div className="border-t pt-4 flex items-center justify-between">
          <p
            className={`text-sm font-medium ${
              event.soldOut ? "text-red-500" : "text-green-600"
            }`}
          >
            {event.soldOut
              ? "No seats remaining"
              : `${event.seatsRemaining} of ${event.capacity} seats remaining`}
          </p>

          <button
            onClick={handleBook}
            disabled={event.soldOut || booking}
            className="bg-blue-600 text-white px-6 py-2 rounded-md
                       hover:bg-blue-700 disabled:opacity-50
                       disabled:cursor-not-allowed font-medium"
          >
            {booking
              ? "Booking..."
              : event.soldOut
              ? "Sold Out"
              : "Book Now"}
          </button>
        </div>

        {message && (
          <p
            className={`mt-3 text-sm font-medium ${
              message.includes("confirmed")
                ? "text-green-600"
                : "text-red-500"
            }`}
          >
            {message}
          </p>
        )}
      </div>
    </div>
  );
}