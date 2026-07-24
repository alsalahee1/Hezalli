/**
 * Idempotent upsert of the later-added demo login accounts —
 * driver@hezalli.com (COURIER), point@hezalli.com (DELIVERY_POINT),
 * wallet@hezalli.com (WALLET_MANAGER), delivery@hezalli.com
 * (DELIVERY_MANAGER).
 *
 * Unlike prisma/seed.ts this is NON-destructive: it adds (or refreshes) just
 * these accounts (and the point's active DeliveryPoint), leaving every existing
 * user, order, and product untouched. Use it to add the one-tap "Courier" and
 * "Point Center" demo logins to a database that was seeded before those
 * accounts existed, without wiping the data.
 *
 * The buyer/seller/admin demo accounts are part of the original seed and are
 * not touched here — this only fills in the two roles the seed added later.
 *
 * Run against the app's database:
 *   docker compose -f deploy/docker-compose.traefik.yml --env-file .env \
 *     run --rm migrate npx tsx prisma/ensure-demo-logins.ts
 *
 * Safe to re-run: matches the seed's emails/password so the one-tap logins and
 * the /driver and /point dashboards work exactly like a fresh seed.
 */
import "dotenv/config";
import type { DeliveryScope, Role } from "../lib/generated/prisma/client";

import { hashPassword } from "../lib/password";
import { prisma } from "../lib/prisma";

const POINT = {
  name: "Sana'a Central Point",
  phone: "+967700000010",
  governorate: "Sana'a",
  city: "Sana'a",
  addressLine: "Al-Zubairi Street, Building 5",
} as const;

// Ensure a user has (at least) the given role and a known password, without
// disturbing any other role or field. Returns whether it was newly created.
async function ensureUser(opts: {
  email: string;
  name: string;
  phone: string;
  role: Role;
  passwordHash: string;
  // For DELIVERY_MANAGER desk staff: the desks they may work. Empty/omitted =
  // Head of Delivery (all desks). Only applied when provided.
  deliveryScopes?: DeliveryScope[];
}): Promise<boolean> {
  const existing = await prisma.user.findUnique({
    where: { email: opts.email },
    select: { id: true, roles: true },
  });

  if (!existing) {
    await prisma.user.create({
      data: {
        name: opts.name,
        email: opts.email,
        emailVerified: new Date(),
        phone: opts.phone,
        phoneVerified: new Date(),
        passwordHash: opts.passwordHash,
        roles: [opts.role],
        deliveryScopes: opts.deliveryScopes ?? [],
        locale: "ar",
      },
    });
    return true;
  }

  const roles: Role[] = Array.from(
    new Set<Role>([...existing.roles, opts.role]),
  );
  await prisma.user.update({
    where: { id: existing.id },
    data: {
      roles: { set: roles },
      passwordHash: opts.passwordHash,
      ...(opts.deliveryScopes
        ? { deliveryScopes: { set: opts.deliveryScopes } }
        : {}),
    },
  });
  return false;
}

async function main() {
  const passwordHash = await hashPassword("hezalli123");

  // --- Courier (Hezalli Express driver) → /driver ---
  const driverCreated = await ensureUser({
    email: "driver@hezalli.com",
    name: "Salah the Driver",
    phone: "+967700000009",
    role: "COURIER",
    passwordHash,
  });
  console.log(
    `Courier ${driverCreated ? "created" : "ensured"} — driver@hezalli.com (COURIER).`,
  );

  // --- Staff managers → /wallet-manager and /delivery-manager ---
  const wmCreated = await ensureUser({
    email: "wallet@hezalli.com",
    name: "Wallet Manager",
    phone: "+967700000011",
    role: "WALLET_MANAGER",
    passwordHash,
  });
  console.log(
    `Wallet Manager ${wmCreated ? "created" : "ensured"} — wallet@hezalli.com (WALLET_MANAGER).`,
  );
  const dmCreated = await ensureUser({
    email: "delivery@hezalli.com",
    name: "Delivery Manager",
    phone: "+967700000012",
    role: "DELIVERY_MANAGER",
    passwordHash,
    // No scopes = Head of Delivery: sees every desk (unchanged behaviour).
    deliveryScopes: [],
  });
  console.log(
    `Delivery Manager ${dmCreated ? "created" : "ensured"} — delivery@hezalli.com (DELIVERY_MANAGER, Head of Delivery).`,
  );

  // --- Scoped desk staff → each sees only their corner of /delivery-manager ---
  // Illustrates the team split: drivers desk, points desk, settlement desk.
  const deskStaff: {
    email: string;
    name: string;
    phone: string;
    scope: DeliveryScope;
  }[] = [
    {
      email: "fleet@hezalli.com",
      name: "Fleet Desk",
      phone: "+967700000013",
      scope: "FLEET",
    },
    {
      email: "points@hezalli.com",
      name: "Points Desk",
      phone: "+967700000014",
      scope: "POINTS",
    },
    {
      email: "settlement@hezalli.com",
      name: "Settlement Desk",
      phone: "+967700000015",
      scope: "SETTLEMENT",
    },
  ];
  for (const s of deskStaff) {
    const created = await ensureUser({
      email: s.email,
      name: s.name,
      phone: s.phone,
      role: "DELIVERY_MANAGER",
      passwordHash,
      deliveryScopes: [s.scope],
    });
    console.log(
      `Delivery desk ${created ? "created" : "ensured"} — ${s.email} (DELIVERY_MANAGER · ${s.scope}).`,
    );
  }

  // --- Point Center (Hezalli Point partner) → /point ---
  // Needs an ACTIVE DeliveryPoint on top of the DELIVERY_POINT role.
  const point = await prisma.user.findUnique({
    where: { email: "point@hezalli.com" },
    select: {
      id: true,
      roles: true,
      deliveryPoints: { select: { id: true }, take: 1 },
    },
  });

  if (!point) {
    await prisma.user.create({
      data: {
        name: POINT.name,
        email: "point@hezalli.com",
        emailVerified: new Date(),
        phone: POINT.phone,
        phoneVerified: new Date(),
        passwordHash,
        roles: ["DELIVERY_POINT"],
        locale: "ar",
        deliveryPoints: {
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
    console.log("Point Center created — point@hezalli.com (DELIVERY_POINT).");
  } else {
    const roles: Role[] = Array.from(
      new Set<Role>([...point.roles, "DELIVERY_POINT"]),
    );
    await prisma.user.update({
      where: { id: point.id },
      data: {
        roles: { set: roles },
        passwordHash,
        deliveryPoints: point.deliveryPoints[0]
          ? {
              update: {
                where: { id: point.deliveryPoints[0].id },
                data: { status: "ACTIVE" },
              },
            }
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
      "Point Center ensured — point@hezalli.com is DELIVERY_POINT with an ACTIVE point.",
    );
  }

  console.log("Demo logins ensured. Password for all: hezalli123");
}

main()
  .catch((error) => {
    console.error("ensure-demo-logins failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
