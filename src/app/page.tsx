import Link from "next/link";

// Eventbrite-style brand orange. Kept local to the landing page.
const ORANGE = "#F05537";

// Music-event banner from Unsplash (concert crowd).
const BANNER =
  "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1600&q=80";

export default function Home() {
  return (
    <div className="flex-1 bg-white text-gray-900">
      {/* Hero banner */}
      <section
        className="relative bg-cover bg-center"
        style={{ backgroundImage: `url(${BANNER})` }}
      >
        {/* Dark overlay so the headline stays readable over the photo. */}
        <div className="absolute inset-0 bg-black/60" />
        <div className="relative max-w-5xl mx-auto px-4 py-28 sm:py-36 text-center">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white max-w-2xl mx-auto leading-tight">
            Live events, <span style={{ color: ORANGE }}>booked in seconds</span>
          </h1>
          <p className="mt-5 text-lg text-gray-200 max-w-xl mx-auto">
            From sold-out concerts to local meetups, BookIt is the simplest way
            to discover events and grab your seat.
          </p>
          <Link
            href="/events"
            className="inline-block mt-8 rounded-full px-8 py-3 font-semibold text-white transition-colors hover:bg-[#d1410c]"
            style={{ backgroundColor: ORANGE }}
          >
            Browse all events
          </Link>
        </div>
      </section>
    </div>
  );
}
