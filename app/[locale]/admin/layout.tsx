import { getLocale } from "next-intl/server";

import { auth } from "@/auth";
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
  if (!session?.user) redirect({ href: "/login", locale });

  // Authorization: only admins may enter the admin panel.
  const roles = session?.user?.roles ?? [];
  if (!roles.includes("ADMIN")) return <Forbidden />;

  return <DashboardShell variant="admin">{children}</DashboardShell>;
}
