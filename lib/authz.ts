import { cookies } from "next/headers";

import { auth } from "@/auth";
import type { PointAccess } from "@/lib/point-access";
import { POINT_BRANCH_COOKIE, resolveActiveBranch } from "@/lib/point-branch";
import { prisma } from "@/lib/prisma";

// Returns the current user's id only if they are an active ADMIN (checked
// against the DB, never the JWT). Used to guard admin-only server actions.
export async function requireAdminId(): Promise<string | null> {
  return requireStaffId("ADMIN");
}

// Staff gate: the user must hold `role` — or ADMIN, which is a superset of
// every staff role. Checked against the DB, never the JWT.
async function requireStaffId(
  role: "ADMIN" | "WALLET_MANAGER" | "DELIVERY_MANAGER",
): Promise<string | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const u = await prisma.user.findUnique({
    where: { id },
    select: { roles: true, isSuspended: true, deletedAt: true },
  });
  if (!u || u.isSuspended || u.deletedAt) return null;
  if (!u.roles.includes(role) && !u.roles.includes("ADMIN")) return null;
  return id;
}

// Guards wallet-domain staff actions (top-ups, withdrawals, ledger tools).
export async function requireWalletManagerId(): Promise<string | null> {
  return requireStaffId("WALLET_MANAGER");
}

// Guards delivery-domain staff actions (shipments, carriers, zones).
export async function requireDeliveryManagerId(): Promise<string | null> {
  return requireStaffId("DELIVERY_MANAGER");
}

// Returns the current active seller's user id + their store id, or null.
// Used to guard seller-only actions and scope queries to the seller's store.
export async function requireSellerStore(): Promise<{
  userId: string;
  storeId: string;
  // False when the store is SUSPENDED/CLOSED. Read paths ignore it; the
  // money-outflow / delivery-attestation actions refuse when it is false so a
  // store an admin suspended for fraud can't keep refunding or attesting
  // deliveries (see requireActiveSellerStore).
  active: boolean;
} | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const u = await prisma.user.findUnique({
    where: { id },
    select: {
      roles: true,
      isSuspended: true,
      deletedAt: true,
      sellerProfile: {
        select: { store: { select: { id: true, status: true } } },
      },
    },
  });
  if (!u || u.isSuspended || u.deletedAt || !u.roles.includes("SELLER")) {
    return null;
  }
  const store = u.sellerProfile?.store;
  if (!store) return null;
  return { userId: id, storeId: store.id, active: store.status === "ACTIVE" };
}

// Returns the active seller's ids (user, seller-profile, store) + whether the
// store is ACTIVE, or null. Unlike a bare session+profile lookup, this rejects
// a SUSPENDED or soft-deleted user (and a non-seller), so a seller an admin
// suspends mid-session can't keep writing on a still-valid JWT. Use for seller
// WRITE paths (products, inventory, store settings, payouts, earnings moves);
// money-outflow callers must additionally require `active`.
export async function requireActiveSeller(): Promise<{
  userId: string;
  profileId: string;
  storeId: string;
  active: boolean;
} | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const u = await prisma.user.findUnique({
    where: { id },
    select: {
      roles: true,
      isSuspended: true,
      deletedAt: true,
      sellerProfile: {
        select: { id: true, store: { select: { id: true, status: true } } },
      },
    },
  });
  if (!u || u.isSuspended || u.deletedAt || !u.roles.includes("SELLER")) {
    return null;
  }
  const store = u.sellerProfile?.store;
  if (!u.sellerProfile || !store) return null;
  return {
    userId: id,
    profileId: u.sellerProfile.id,
    storeId: store.id,
    active: store.status === "ACTIVE",
  };
}

// Returns the current user's id + their delivery point id, only if they work
// at an ACTIVE point (checked against the DB): either the DELIVERY_POINT
// operator owning it, or an active PointStaff member — membership is the
// grant, staff never hold the role. `access` reports which tier so callers
// can scope what each job may do (see lib/point-access.ts). Guards
// point-operator actions/pages.
export async function requireDeliveryPoint(): Promise<{
  userId: string;
  pointId: string;
  access: PointAccess;
} | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const u = await prisma.user.findUnique({
    where: { id },
    select: {
      roles: true,
      isSuspended: true,
      deletedAt: true,
      // An owner may run several branches (docs §42j); the one they're
      // operating comes from the point_branch cookie, defaulting to the first.
      deliveryPoints: {
        where: { status: "ACTIVE" },
        select: { id: true },
        orderBy: { createdAt: "asc" },
      },
      pointStaff: {
        select: {
          role: true,
          isActive: true,
          point: { select: { id: true, status: true } },
        },
      },
    },
  });
  if (!u || u.isSuspended || u.deletedAt) return null;
  if (u.roles.includes("DELIVERY_POINT") && u.deliveryPoints.length > 0) {
    // Only a multi-branch owner needs the cookie; the common single-branch
    // case skips it (and avoids reading cookies outside a request scope).
    const cookie =
      u.deliveryPoints.length > 1
        ? (await cookies()).get(POINT_BRANCH_COOKIE)?.value
        : undefined;
    const branch = resolveActiveBranch(u.deliveryPoints, cookie);
    if (branch) return { userId: id, pointId: branch.id, access: "OWNER" };
  }
  const staff = u.pointStaff;
  if (staff?.isActive && staff.point.status === "ACTIVE") {
    return { userId: id, pointId: staff.point.id, access: staff.role };
  }
  return null;
}

// Returns the current user's id + the fleet they own, only if they own an
// ACTIVE fleet (checked against the DB). Guards the read-only fleet portal.
// No dedicated role: ownership of an active fleet IS the grant.
export async function requireFleetOwner(): Promise<{
  userId: string;
  fleetId: string;
} | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const u = await prisma.user.findUnique({
    where: { id },
    select: {
      isSuspended: true,
      deletedAt: true,
      ownedFleet: { select: { id: true, isActive: true } },
    },
  });
  if (
    !u ||
    u.isSuspended ||
    u.deletedAt ||
    !u.ownedFleet ||
    !u.ownedFleet.isActive
  ) {
    return null;
  }
  return { userId: id, fleetId: u.ownedFleet.id };
}

// Returns the current user's id only if they are an active COURIER (Hezalli
// Express driver), checked against the DB. Guards driver-only actions/pages.
export async function requireCourierId(): Promise<string | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const u = await prisma.user.findUnique({
    where: { id },
    select: { roles: true, isSuspended: true, deletedAt: true },
  });
  if (!u || u.isSuspended || u.deletedAt || !u.roles.includes("COURIER")) {
    return null;
  }
  return id;
}
