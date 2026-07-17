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
