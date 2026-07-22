/**
 * Safe first-admin bootstrap for a production database.
 *
 * The production deploy path intentionally does NOT seed any login-able
 * accounts (the demo seed's shared "hezalli123" password would be a public
 * backdoor — see prisma/seed-if-empty.ts). Use this script once, right after
 * the first deploy, to create (or promote) a single real ADMIN with a strong
 * password you choose.
 *
 * Usage (values come from the environment, never the command line, so the
 * password is not captured in shell history / process listings):
 *
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='<strong-password>' \
 *     npx tsx scripts/create-admin.ts
 *
 * Idempotent: if the email already exists it is promoted to ADMIN and (when
 * ADMIN_PASSWORD is given) its password is reset. Never prints the password.
 */
import "dotenv/config";

import { generateReferralCode } from "../lib/loyalty";
import { hashPassword } from "../lib/password";
import { prisma } from "../lib/prisma";

// Passwords the demo seed uses — refused outright so a "real" admin can never
// be created with a publicly-known credential.
const FORBIDDEN_PASSWORDS = new Set(["hezalli123", "password", "admin"]);

function assertStrong(password: string): void {
  if (password.length < 12) {
    throw new Error("ADMIN_PASSWORD must be at least 12 characters.");
  }
  if (FORBIDDEN_PASSWORDS.has(password.toLowerCase())) {
    throw new Error(
      "ADMIN_PASSWORD is a known/default password — choose a unique one.",
    );
  }
}

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  const name = (process.env.ADMIN_NAME ?? "Administrator").trim();

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error("Set ADMIN_EMAIL to a valid email address.");
  }
  if (!password) {
    throw new Error("Set ADMIN_PASSWORD (min 12 chars).");
  }
  assertStrong(password);

  const passwordHash = await hashPassword(password);
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, roles: true },
  });

  if (existing) {
    const roles = Array.from(new Set([...existing.roles, "ADMIN"])) as (
      | "ADMIN"
      | "BUYER"
    )[];
    await prisma.user.update({
      where: { id: existing.id },
      data: { roles: roles as never, passwordHash, isSuspended: false },
    });
    console.log(`Promoted existing account ${email} to ADMIN and reset its password.`);
    return;
  }

  await prisma.user.create({
    data: {
      name,
      email,
      emailVerified: new Date(),
      passwordHash,
      roles: ["ADMIN"],
      locale: "en",
      referralCode: generateReferralCode(),
    },
  });
  console.log(`Created ADMIN account ${email}.`);
}

main()
  .catch((error) => {
    console.error("create-admin failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
