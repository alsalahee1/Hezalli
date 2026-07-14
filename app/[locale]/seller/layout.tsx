import { getLocale } from "next-intl/server";

import { auth } from "@/auth";
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
  if (!session?.user) redirect({ href: "/login", locale });

  // Authorization: only sellers may enter the seller center.
  const roles = session?.user?.roles ?? [];
  if (!roles.includes("SELLER")) return <Forbidden />;

  return <DashboardShell variant="seller">{children}</DashboardShell>;
}
