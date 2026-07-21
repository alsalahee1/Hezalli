import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Returns the current user's id only if they are an active ADMIN (checked
// against the DB, never the JWT). Used to guard admin-only server actions.
export async function requireAdminId(): Promise<string | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const u = await prisma.user.findUnique({
    where: { id },
    select: { roles: true, isSuspended: true, deletedAt: true },
  });
  if (!u || u.isSuspended || u.deletedAt || !u.roles.includes("ADMIN")) {
    return null;
  }
  return id;
}

// Returns the current active seller's user id + their store id, or null.
// Used to guard seller-only actions and scope queries to the seller's store.
export async function requireSellerStore(): Promise<{
  userId: string;
  storeId: string;
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
      sellerProfile: { select: { store: { select: { id: true } } } },
    },
  });
  if (!u || u.isSuspended || u.deletedAt || !u.roles.includes("SELLER")) {
    return null;
  }
  const storeId = u.sellerProfile?.store?.id;
  if (!storeId) return null;
  return { userId: id, storeId };
}

// Returns the current user's id + their delivery point id, only if they are an
// active DELIVERY_POINT operator owning an ACTIVE point (checked against the
// DB). Guards point-operator actions/pages.
export async function requireDeliveryPoint(): Promise<{
  userId: string;
  pointId: string;
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
      deliveryPoint: { select: { id: true, status: true } },
    },
  });
  if (
    !u ||
    u.isSuspended ||
    u.deletedAt ||
    !u.roles.includes("DELIVERY_POINT") ||
    u.deliveryPoint?.status !== "ACTIVE"
  ) {
    return null;
  }
  return { userId: id, pointId: u.deliveryPoint.id };
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
