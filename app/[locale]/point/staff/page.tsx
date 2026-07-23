import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Users } from "lucide-react";

import { requireDeliveryPoint } from "@/lib/authz";
import { canManagePoint } from "@/lib/point-access";
import { prisma } from "@/lib/prisma";
import { redirect } from "@/i18n/navigation";
import { PointStaffManager } from "@/components/point/point-staff-manager";

// The hub's team screen (docs §42d): who works here and as what. The owner
// (or a store manager) attaches existing Hezalli accounts by phone/email,
// changes jobs, pauses people, or removes them. Everyone else is redirected —
// the roster is the shop's business, not the counter's.
export default async function PointStaffPage() {
  const gate = await requireDeliveryPoint();
  if (!gate) return null;
  if (!canManagePoint(gate.access)) {
    redirect({ href: "/point", locale: await getLocale() });
  }
  const t = await getTranslations("Point");
  const format = await getFormatter();

  const [point, staff] = await Promise.all([
    prisma.deliveryPoint.findUnique({
      where: { id: gate.pointId },
      select: { owner: { select: { name: true, phone: true } } },
    }),
    prisma.pointStaff.findMany({
      where: { pointId: gate.pointId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        role: true,
        isActive: true,
        createdAt: true,
        userId: true,
        user: { select: { name: true, phone: true, email: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <Users className="text-primary size-5" /> {t("staffTitle")}
        </h1>
        <p className="text-muted-foreground text-sm">{t("staffSubtitle")}</p>
      </div>

      <PointStaffManager
        owner={{
          name: point?.owner.name ?? null,
          phone: point?.owner.phone ?? null,
        }}
        // The viewer's own row is server-immutable (isSelf guard); flag it so
        // the UI doesn't offer buttons that can only fail.
        selfUserId={gate.userId}
        staff={staff.map((s) => ({
          id: s.id,
          userId: s.userId,
          role: s.role,
          isActive: s.isActive,
          name: s.user.name,
          contact: s.user.phone ?? s.user.email ?? null,
          since: format.dateTime(s.createdAt, { dateStyle: "medium" }),
        }))}
      />
    </div>
  );
}
