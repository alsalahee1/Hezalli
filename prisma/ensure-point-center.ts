/**
 * Idempotent upsert of the demo Point Center (Hezalli Point) account.
 *
 * Unlike prisma/seed.ts this is NON-destructive: it adds (or refreshes) a
 * single DELIVERY_POINT partner — point@hezalli.com — and its active
 * DeliveryPoint, leaving every existing user, order, and product untouched.
 * Use it to add the one-tap "Point Center" demo login to a database that was
 * already seeded before that account existed, without wiping the data.
 *
 * Run against the app's database:
 *   docker compose -f deploy/docker-compose.traefik.yml --env-file .env \
 *     run --rm migrate npx tsx prisma/ensure-point-center.ts
 *
 * Safe to re-run: matches the seed's email/password so the one-tap login and
 * /point dashboard work exactly like a fresh seed.
 */
import "dotenv/config";
import type { Role } from "../lib/generated/prisma/client";

import { hashPassword } from "../lib/password";
import { prisma } from "../lib/prisma";

const EMAIL = "point@hezalli.com";
const POINT = {
  name: "Sana'a Central Point",
  phone: "+967700000010",
  governorate: "Sana'a",
  city: "Sana'a",
  addressLine: "Al-Zubairi Street, Building 5",
} as const;

async function main() {
  const passwordHash = await hashPassword("hezalli123");

  const existing = await prisma.user.findUnique({
    where: { email: EMAIL },
    select: { id: true, roles: true, deliveryPoint: { select: { id: true } } },
  });

  if (!existing) {
    await prisma.user.create({
      data: {
        name: POINT.name,
        email: EMAIL,
        emailVerified: new Date(),
        phone: POINT.phone,
        phoneVerified: new Date(),
        passwordHash,
        roles: ["DELIVERY_POINT"],
        locale: "ar",
        deliveryPoint: {
          create: {
            name: POINT.name,
            phone: POINT.phone,
            governorate: POINT.governorate,
            city: POINT.city,
            addressLine: POINT.addressLine,
            status: "ACTIVE",
          },
        },
      },
    });
    console.log(`Point Center created — ${EMAIL} (password: hezalli123).`);
    return;
  }

  // User exists: make sure it can actually sign in and reach /point. Ensure the
  // DELIVERY_POINT role, a known password, and an ACTIVE DeliveryPoint. Nothing
  // else about the account (or the rest of the database) is touched.
  const roles: Role[] = Array.from(
    new Set<Role>([...existing.roles, "DELIVERY_POINT"]),
  );
  await prisma.user.update({
    where: { id: existing.id },
    data: {
      roles: { set: roles },
      passwordHash,
      deliveryPoint: existing.deliveryPoint
        ? { update: { status: "ACTIVE" } }
        : {
            create: {
              name: POINT.name,
              phone: POINT.phone,
              governorate: POINT.governorate,
              city: POINT.city,
              addressLine: POINT.addressLine,
              status: "ACTIVE",
            },
          },
    },
  });
  console.log(
    `Point Center ensured — ${EMAIL} is DELIVERY_POINT with an ACTIVE point.`,
  );
}

main()
  .catch((error) => {
    console.error("ensure-point-center failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
