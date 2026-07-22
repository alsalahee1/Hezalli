import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";

import { requireDeliveryManagerId } from "@/lib/authz";
import { fleetDetail } from "@/lib/fleet";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { Link } from "@/i18n/navigation";
import { Forbidden } from "@/components/auth/forbidden";
import { FleetSettingsForm } from "@/components/admin/fleet-settings-form";
import { FleetRoster } from "@/components/admin/fleet-roster";

// Fleet detail: settings, rolled-up totals, and the roster (add/remove couriers,
// set the partner owner).
export async function FleetDetailView({
  base,
  params,
}: {
  base: string;
  params: Promise<{ fleetId: string }>;
}) {
  const adminId = await requireDeliveryManagerId();
  if (!adminId) return <Forbidden />;
  const { fleetId } = await params;
  const t = await getTranslations("AdminFleets");
  const format = await getFormatter();

  const fleet = await fleetDetail(fleetId);
  if (!fleet) notFound();

  // Couriers not in any fleet — the pool the admin can add to this one.
  const unassigned = await prisma.user.findMany({
    where: {
      roles: { has: "COURIER" },
      fleetId: null,
      deletedAt: null,
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  });
  const assignable = unassigned.map((c) => ({
    id: c.id,
    label: c.name ?? c.email ?? c.id.slice(-6),
  }));

  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

  const stats: { key: string; value: string; accent?: boolean }[] = [
    { key: "totalDrivers", value: String(fleet.totals.drivers) },
    { key: "totalActive", value: String(fleet.totals.activeJobs) },
    { key: "totalDelivered", value: String(fleet.totals.delivered) },
    {
      key: "totalCash",
      value: money(fleet.totals.cashOnHand),
      accent: fleet.totals.cashOnHand > 0,
    },
    { key: "totalOwed", value: money(fleet.totals.earningsOwed) },
    {
      key: "totalRating",
      value:
        fleet.totals.rating != null
          ? `★ ${fleet.totals.rating.toFixed(1)}`
          : "—",
    },
  ];

  return (
    <div className="space-y-6">
      <Link
        href={`${base}/fleets`}
        className="text-muted-foreground inline-flex items-center gap-1 text-sm hover:underline"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" /> {t("backToFleets")}
      </Link>

      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          {fleet.name}
          {!fleet.isActive ? (
            <span className="text-muted-foreground rounded border px-2 py-0.5 text-xs font-normal">
              {t("inactive")}
            </span>
          ) : null}
        </h1>
        {fleet.ownerLabel ? (
          <p className="text-muted-foreground text-sm">
            {t("ownerLabel")}: {fleet.ownerLabel}
          </p>
        ) : null}
      </div>

      {/* Rolled-up totals */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <div
            key={s.key}
            className={cn(
              "rounded-xl border p-4",
              s.accent && "border-amber-500/40 bg-amber-500/5",
            )}
          >
            <p className="text-muted-foreground text-xs">{t(s.key)}</p>
            <p className="mt-1 text-lg font-semibold" dir="ltr">
              {s.value}
            </p>
          </div>
        ))}
      </div>

      <section className="rounded-xl border p-4">
        <h2 className="mb-3 text-sm font-semibold">{t("settingsTitle")}</h2>
        <FleetSettingsForm
          fleetId={fleet.id}
          name={fleet.name}
          contactPhone={fleet.contactPhone}
          contactEmail={fleet.contactEmail}
          isActive={fleet.isActive}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">{t("rosterTitle")}</h2>
        <FleetRoster
          fleetId={fleet.id}
          drivers={fleet.drivers}
          ownerId={fleet.ownerId}
          assignable={assignable}
        />
      </section>
    </div>
  );
}
