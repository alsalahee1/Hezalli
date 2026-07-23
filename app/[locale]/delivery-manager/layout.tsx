import { getLocale } from "next-intl/server";

import { auth } from "@/auth";
import { getDeliveryAccess } from "@/lib/authz";
import { visibleNavKeys } from "@/lib/delivery-access";
import { redirect } from "@/i18n/navigation";
import { Forbidden } from "@/components/auth/forbidden";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default async function DeliveryManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const locale = await getLocale();

  // Authentication (the middleware also gates this, belt-and-suspenders).
  if (!session?.user?.id) redirect({ href: "/login", locale });

  // Authorization + desk access from the DB, not the JWT (authoritative; picks
  // up role, scope, and suspension changes without a re-login). ADMIN and a
  // Head of Delivery (no stored scopes) get "ALL"; a scoped member gets only
  // their desks. Not on the team at all → Forbidden.
  const gate = await getDeliveryAccess();
  if (!gate) return <Forbidden />;

  // Trim the sidebar to the desks this member may work — the per-page and
  // per-action gates enforce the same rule if someone types a URL directly.
  return (
    <DashboardShell
      variant="deliveryManager"
      navKeys={visibleNavKeys(gate.access)}
    >
      {children}
    </DashboardShell>
  );
}
