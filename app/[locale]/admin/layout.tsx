import { getLocale } from "next-intl/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "@/i18n/navigation";
import { Forbidden } from "@/components/auth/forbidden";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const locale = await getLocale();

  // Authentication (the middleware also gates this, belt-and-suspenders).
  if (!session?.user?.id) redirect({ href: "/login", locale });

  // Authorization from the DB, not the JWT (authoritative; picks up role and
  // suspension changes without waiting for a re-login).
  const user = await prisma.user.findUnique({
    where: { id: session!.user.id },
    select: { roles: true, isSuspended: true, deletedAt: true },
  });
  if (!user || user.deletedAt) redirect({ href: "/login", locale });
  if (user!.isSuspended || !user!.roles.includes("ADMIN")) return <Forbidden />;

  return <DashboardShell variant="admin">{children}</DashboardShell>;
}
