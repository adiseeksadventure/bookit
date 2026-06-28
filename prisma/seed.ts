import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding...");

  const hash = (p: string) => bcrypt.hash(p, 10);

  const org1 = await prisma.user.upsert({
    where: { email: "alice@organizer.com" },
    update: {},
    create: {
      email: "alice@organizer.com",
      name: "Alice",
      passwordHash: await hash("password123"),
      role: "organizer",
    },
  });

  const org2 = await prisma.user.upsert({
    where: { email: "bob@organizer.com" },
    update: {},
    create: {
      email: "bob@organizer.com",
      name: "Bob",
      passwordHash: await hash("password123"),
      role: "organizer",
    },
  });

  const user1 = await prisma.user.upsert({
    where: { email: "charlie@user.com" },
    update: {},
    create: {
      email: "charlie@user.com",
      name: "Charlie",
      passwordHash: await hash("password123"),
      role: "user",
    },
  });

  const now = new Date();
  const future = (days: number) =>
    new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const events = await Promise.all([
    prisma.event.upsert({
      where: { id: "event-1" },
      update: {},
      create: {
        id: "event-1",
        title: "React Mumbai Meetup",
        description: "Monthly React.js community meetup in Mumbai.",
        venue: "WeWork BKC, Mumbai",
        date: future(5),
        capacity: 50,
        price: 0,
        organizerId: org1.id,
      },
    }),
    prisma.event.upsert({
      where: { id: "event-2" },
      update: {},
      create: {
        id: "event-2",
        title: "AI & GenAI Summit 2025",
        description: "Full day conference on AI trends and tooling.",
        venue: "Taj Lands End, Mumbai",
        date: future(10),
        capacity: 2,
        price: 999,
        organizerId: org1.id,
      },
    }),
    prisma.event.upsert({
      where: { id: "event-3" },
      update: {},
      create: {
        id: "event-3",
        title: "Startup Pitch Night",
        description: "10 startups pitch to angel investors.",
        venue: "91springboard, Delhi",
        date: future(3),
        capacity: 100,
        price: 200,
        organizerId: org2.id,
      },
    }),
    prisma.event.upsert({
      where: { id: "event-4" },
      update: {},
      create: {
        id: "event-4",
        title: "UI/UX Design Workshop",
        description: "Hands-on Figma workshop for beginners.",
        venue: "Online",
        date: future(7),
        capacity: 30,
        price: 499,
        organizerId: org2.id,
      },
    }),
    prisma.event.upsert({
      where: { id: "event-5" },
      update: {},
      create: {
        id: "event-5",
        title: "Sold Out Show — Test Event",
        description: "This event has 1 seat and it is already taken.",
        venue: "Mumbai",
        date: future(2),
        capacity: 1,
        price: 100,
        organizerId: org1.id,
      },
    }),
  ]);

  // --- Bulk events so the listing has enough rows to demo pagination
  // (20 per page) and search across topics/cities. Deterministic ids +
  // upsert keep re-seeding idempotent. event-6 .. event-50 = 45 more (50 total).
  const titlePool = [
    "React Conf",
    "Node.js Deep Dive",
    "AI & ML Summit",
    "Startup Pitch Day",
    "UX Design Bootcamp",
    "DevOps Days",
    "Web3 Builders Meetup",
    "Product Management 101",
    "Data Engineering Summit",
    "Cybersecurity Workshop",
    "Flutter Forward",
    "Rust Systems Meetup",
    "Cloud Native Day",
    "GraphQL Conf",
    "Python Pune",
    "Kubernetes Workshop",
    "Indie Hackers Mixer",
    "Blockchain Bootcamp",
    "Frontend Masters Live",
    "Backend Bytes",
  ];
  const cityPool = [
    "Mumbai",
    "Delhi",
    "Bengaluru",
    "Pune",
    "Hyderabad",
    "Chennai",
    "Kolkata",
    "Goa",
  ];
  const venuePool = [
    "Convention Centre",
    "Tech Park Auditorium",
    "Grand Ballroom",
    "Community Hall",
    "Innovation Hub",
    "WeWork",
    "Riverside Arena",
    "Expo Centre",
  ];
  const capacityPool = [20, 30, 50, 75, 100, 150, 200];
  const pricePool = [0, 199, 299, 499, 799, 999, 1499];

  const bulkEvents: Promise<unknown>[] = [];
  for (let idx = 0; idx < 45; idx++) {
    const i = idx + 6;
    const topic = titlePool[idx % titlePool.length];
    const city = cityPool[idx % cityPool.length];
    bulkEvents.push(
      prisma.event.upsert({
        where: { id: `event-${i}` },
        update: {},
        create: {
          id: `event-${i}`,
          title: `${topic} — ${city}`,
          description: `${topic} in ${city}. Network with the community, attend talks, and build something.`,
          venue: `${venuePool[idx % venuePool.length]}, ${city}`,
          date: future(idx + 3),
          capacity: capacityPool[idx % capacityPool.length],
          price: pricePool[idx % pricePool.length],
          organizerId: idx % 2 === 0 ? org1.id : org2.id,
        },
      })
    );
  }
  await Promise.all(bulkEvents);

  // Bookings: the original sold-out event-5, plus a couple so "My Bookings"
  // and seats-remaining have some variety in the demo.
  await prisma.booking.upsert({
    where: { id: "booking-1" },
    update: {},
    create: {
      id: "booking-1",
      userId: user1.id,
      eventId: events[4].id,
      status: "confirmed",
    },
  });
  await prisma.booking.upsert({
    where: { id: "booking-2" },
    update: {},
    create: { id: "booking-2", userId: user1.id, eventId: "event-6", status: "confirmed" },
  });
  await prisma.booking.upsert({
    where: { id: "booking-3" },
    update: {},
    create: { id: "booking-3", userId: user1.id, eventId: "event-10", status: "confirmed" },
  });

  console.log("Seeded: 2 organizers, 1 user, 50 events, 3 bookings (event-5 sold out)");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());