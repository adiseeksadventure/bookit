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

  console.log("Seeded: 2 organizers, 1 user, 5 events, 1 booking (event-5 sold out)");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());