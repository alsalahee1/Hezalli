/**
 * Idempotent seed guard for production deploys.
 *
 * The main seed (prisma/seed.ts) is DESTRUCTIVE — it wipes every table before
 * inserting fresh sample data — so it must never run against a database that
 * already holds real records. This guard runs on every deploy (from the
 * compose `migrate` service) but only invokes the seed when the database is
 * empty, i.e. the very first deploy. On every later deploy it is a no-op, so
 * live orders, users, and products are left untouched.
 */
import "dotenv/config";
import { execSync } from "node:child_process";

import { prisma } from "../lib/prisma";

async function main() {
  const users = await prisma.user.count();
  if (users > 0) {
    console.log(`Seed skipped — database already has ${users} user(s).`);
    return;
  }

  console.log("Database is empty — seeding initial data …");
  // Release this connection before the seed opens its own.
  await prisma.$disconnect();
  execSync("npx tsx prisma/seed.ts", { stdio: "inherit" });
}

main()
  .catch(async (error) => {
    console.error("Seed guard failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
