/**
 * Idempotent seed guard for empty databases.
 *
 * The main seed (prisma/seed.ts) is DESTRUCTIVE — it wipes every table before
 * inserting fresh sample data — so it must never run against a database that
 * already holds real records. This guard only invokes the seed when the
 * database is empty. On every later deploy it is a no-op, so live orders,
 * users, and products are left untouched.
 *
 * SECURITY: the demo seed creates staff/admin accounts that all share a single,
 * publicly-known password ("hezalli123", committed in prisma/seed.ts). Running
 * it against a real (production) database would hand anyone full admin access
 * through the normal login form. So this guard refuses to run in production
 * unless SEED_ALLOWED=true is explicitly set. A production deploy gets its
 * reference data from ensure-categories.ts (categories) and SETTING_DEFAULTS
 * (platform settings); create the first real admin with scripts/create-admin.ts.
 */
import "dotenv/config";
import { execSync } from "node:child_process";

import { prisma } from "../lib/prisma";

async function main() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.SEED_ALLOWED !== "true"
  ) {
    console.log(
      "Demo seed skipped — NODE_ENV=production. The demo seed creates accounts " +
        "with a shared, publicly-known password and must never run against a " +
        "real database. Categories come from ensure-categories.ts; create your " +
        "admin with `npx tsx scripts/create-admin.ts`. Set SEED_ALLOWED=true " +
        "only to override on a throwaway/staging database.",
    );
    return;
  }

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
