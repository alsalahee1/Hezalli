import { getLocale } from "next-intl/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "@/i18n/navigation";
import { Forbidden } from "@/components/auth/forbidden";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default async function SellerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const locale = await getLocale();

  // Authentication (the middleware also gates this, belt-and-suspenders).
  if (!session?.user?.id) redirect({ href: "/login", locale });

  // Authorization from the DB, not the JWT: authoritative, and correct even
  // right after "become a seller" grants the role mid-session.
  const user = await prisma.user.findUnique({
    where: { id: session!.user.id },
    select: { roles: true, isSuspended: true, deletedAt: true },
  });
  if (!user || user.deletedAt) redirect({ href: "/login", locale });
  if (user!.isSuspended) return <Forbidden />;

  // Not a seller yet → invite them to open a store instead of a dead 403.
  if (!user!.roles.includes("SELLER")) redirect({ href: "/sell", locale });

  return <DashboardShell variant="seller">{children}</DashboardShell>;
}
