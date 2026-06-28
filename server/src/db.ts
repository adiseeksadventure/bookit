// Prisma client for the Express service. Identical pattern to the Next app's
// `src/lib/db.ts` — the schema, migrations, and generated client are shared; the
// only difference is this runs in its own (Express) process, so it gets its own
// client instance pointed at the same database via DATABASE_URL.
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
