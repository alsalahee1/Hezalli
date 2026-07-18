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
