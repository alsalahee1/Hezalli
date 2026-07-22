import { getLocale } from "next-intl/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "@/i18n/navigation";
import { Forbidden } from "@/components/auth/forbidden";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default async function WalletManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const locale = await getLocale();

  // Authentication (the middleware also gates this, belt-and-suspenders).
  if (!session?.user?.id) redirect({ href: "/login", locale });

  // Authorization from the DB, not the JWT (authoritative; picks up role and
  // suspension changes without waiting for a re-login). ADMIN is a superset.
  const user = await prisma.user.findUnique({
    where: { id: session!.user.id },
    select: { roles: true, isSuspended: true, deletedAt: true },
  });
  if (!user || user.deletedAt) redirect({ href: "/login", locale });
  const allowed =
    user!.roles.includes("WALLET_MANAGER") || user!.roles.includes("ADMIN");
  if (user!.isSuspended || !allowed) return <Forbidden />;

  return <DashboardShell variant="walletManager">{children}</DashboardShell>;
}
