import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { PackageCheck, Truck, Users, Wallet } from "lucide-react";

import { requireDeliveryPoint } from "@/lib/authz";
import { canManagePoint } from "@/lib/point-access";
import { pointStaffActivity } from "@/lib/point-staff-activity";
import { prisma } from "@/lib/prisma";
import { redirect } from "@/i18n/navigation";
import { PointStaffManager } from "@/components/point/point-staff-manager";

// The hub's team screen (docs §42d/§42e): who works here and as what, plus
// today's per-person activity so the owner can see who did what and reconcile
// each cashier's drawer. The owner (or a store manager) attaches existing
// Hezalli accounts by phone/email, changes jobs, pauses people, or removes
// them. Everyone else is redirected — the roster is the shop's business.
export default async function PointStaffPage() {
  const gate = await requireDeliveryPoint();
  if (!gate) return null;
  if (!canManagePoint(gate.access)) {
    redirect({ href: "/point", locale: await getLocale() });
  }
  const t = await getTranslations("Point");
  const format = await getFormatter();
  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

  // Today, platform local time — same day boundary as the hub dashboard.
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [point, staff, activity] = await Promise.all([
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
    pointStaffActivity(gate.pointId, startOfDay, new Date()),
  ]);

  // Only surface people who actually did something today; the roster below
  // already shows the full team.
  const active = activity
    .filter(
      (r) =>
        r.received + r.handedOver + r.pickups + r.returns > 0 ||
        r.codCollected > 0,
    )
    .sort((a, b) => b.codCollected - a.codCollected);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <Users className="text-primary size-5" /> {t("staffTitle")}
        </h1>
        <p className="text-muted-foreground text-sm">{t("staffSubtitle")}</p>
      </div>

      {/* Today's per-person scoreboard — accountability + cash reconciliation. */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">{t("activityToday")}</h2>
        {active.length === 0 ? (
          <p className="text-muted-foreground rounded-xl border border-dashed py-6 text-center text-xs">
            {t("activityEmpty")}
          </p>
        ) : (
          <ul className="space-y-2">
            {active.map((r) => (
              <li key={r.userId} className="rounded-xl border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium">
                    {r.name ?? t("staffOwnerFallback")}
                    <span className="text-muted-foreground text-xs">
                      {" · "}
                      {r.role === "OWNER"
                        ? t("staffOwnerBadge")
                        : r.role === "FORMER"
                          ? t("activityFormer")
                          : t(`staffRole_${r.role}`)}
                    </span>
                  </p>
                  {r.codCollected > 0 ? (
                    <span
                      className="flex shrink-0 items-center gap-1 text-sm font-semibold text-emerald-700 dark:text-emerald-400"
                      dir="ltr"
                    >
                      <Wallet className="size-3.5" />
                      {money(r.codCollected)}
                    </span>
                  ) : null}
                </div>
                <div className="text-muted-foreground mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  <span className="flex items-center gap-1">
                    <PackageCheck className="size-3.5" />
                    {t("actReceived", { count: r.received })}
                  </span>
                  <span className="flex items-center gap-1">
                    <Truck className="size-3.5" />
                    {t("actHanded", { count: r.handedOver })}
                  </span>
                  {r.pickups > 0 ? (
                    <span>{t("actPickups", { count: r.pickups })}</span>
                  ) : null}
                  {r.returns > 0 ? (
                    <span>{t("actReturns", { count: r.returns })}</span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

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
