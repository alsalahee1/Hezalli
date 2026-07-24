import { getTranslations } from "next-intl/server";

import { prisma } from "@/lib/prisma";
import { isDeliveryScope } from "@/lib/delivery-access";
import {
  DeliveryTeamManager,
  type TeamMember,
} from "@/components/admin/delivery-team-manager";

export const dynamic = "force-dynamic";

// Admin desk: shape the delivery-ops team. Each DELIVERY_MANAGER is a member;
// their deliveryScopes narrow which desks (Dispatch / Fleet / Points /
// Settlement / Network) they may work. No desks = Head of Delivery, full
// access. The admin layout gates the ADMIN role.
export default async function AdminDeliveryTeamPage() {
  const t = await getTranslations("AdminDeliveryTeam");

  const users = await prisma.user.findMany({
    where: { roles: { has: "DELIVERY_MANAGER" }, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, deliveryScopes: true },
  });

  const members: TeamMember[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    scopes: u.deliveryScopes.filter(isDeliveryScope),
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("desc")}</p>
      </div>
      <DeliveryTeamManager members={members} />
    </div>
  );
}
