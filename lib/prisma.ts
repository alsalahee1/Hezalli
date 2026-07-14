import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/lib/generated/prisma/client";

// Prisma 7 requires a driver adapter to connect the runtime client. We use
// the pg adapter, reading the connection string from DATABASE_URL (loaded
// from `.env` by Next.js automatically). See prisma.config.ts for the CLI.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

// Reuse a single PrismaClient across hot reloads in development to avoid
// exhausting database connections.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
