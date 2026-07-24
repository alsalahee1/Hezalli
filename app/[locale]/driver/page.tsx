import { getFormatter, getTranslations } from "next-intl/server";
import {
  AlertTriangle,
  ChevronRight,
  Clock,
  MapPin,
  PackageCheck,
  PackageSearch,
  Trophy,
  UsersRound,
  Wallet,
} from "lucide-react";

import { requireCourierId } from "@/lib/authz";
import { courierCodStatus } from "@/lib/cod-guard";
import { courierCashSummary } from "@/lib/courier-ledger";
import { syncedCourierPerformance } from "@/lib/courier-performance";
import { boardReadyAtPoint, openBoardWhere } from "@/lib/job-board";
import { prisma } from "@/lib/prisma";
import { getPlatformSettings } from "@/lib/settings";
import { dueBy as computeDueBy, slaState, slaWeight } from "@/lib/sla";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { LocationShare } from "@/components/driver/location-share";
import { OfferActions } from "@/components/driver/offer-actions";
import { PauseToggle } from "@/components/driver/pause-toggle";
import { PushToggle } from "@/components/driver/push-toggle";
import { StarRating } from "@/components/product/star-rating";
import { DeliveryWindowBadge } from "@/components/orders/delivery-window-badge";

export default async function DriverJobsPage() {
  const courierId = await requireCourierId();
  const t = await getTranslations("Driver");
  const tShip = await getTranslations("Orders");
  const format = await getFormatter();
  if (!courierId) return null;

  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

  const [rawJobs, settings, location, cash, cod, perf, boardRows, me] =
    await Promise.all([
      prisma.shipment.findMany({
        where: { driverId: courierId, subOrder: { status: "SHIPPED" } },
        select: {
          id: true,
          status: true,
          shippedAt: true,
          // A live offer means this job is only PROPOSED — the card grows
          // accept/decline controls until the driver answers (or first-scans).
          offers: {
            where: { driverId: courierId, status: "OFFERED" },
            select: { expiresAt: true },
          },
          subOrder: {
            select: {
              shippingMethod: true,
              store: { select: { name: true } },
              order: {
                select: {
                  id: true,
                  deliveryDate: true,
                  deliverySlot: true,
                  address: {
                    select: {
                      fullName: true,
                      city: true,
                      governorate: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
      getPlatformSettings(),
      prisma.courierLocation.findUnique({
        where: { userId: courierId },
        select: { governorate: true },
      }),
      courierCashSummary(courierId),
      courierCodStatus(courierId),
      syncedCourierPerformance(courierId),
      // Open, claimable board parcels — for the "job board" teaser card.
      prisma.shipment.findMany({
        where: openBoardWhere(),
        take: 100,
        select: { status: true, deliveryPointId: true, atPointId: true },
      }),
      prisma.user.findUnique({
        where: { id: courierId },
        select: { courierPausedAt: true },
      }),
    ]);
  const boardCount = boardRows.filter(boardReadyAtPoint).length;

  const now = new Date();
  const jobs = rawJobs
    .map((j) => {
      const etaMax =
        j.subOrder.shippingMethod === "EXPRESS"
          ? settings.express_eta_max_days
          : settings.std_eta_max_days;
      const sla = j.shippedAt
        ? slaState(computeDueBy(j.shippedAt, etaMax), now)
        : "on_track";
      return { ...j, sla };
    })
    // Most urgent (overdue) first, then oldest.
    .sort(
      (a, b) =>
        slaWeight(a.sla) - slaWeight(b.sla) ||
        (a.shippedAt?.getTime() ?? 0) - (b.shippedAt?.getTime() ?? 0),
    );

  return (
    <div className="space-y-4">
      {/* Performance & badges banner, first thing on the page: the driver's
          own scoreboard → /driver/stats. Volume AND quality both count
          (lib/courier-badges.ts). */}
      <Link
        href="/driver/stats"
        className="hover:border-primary/50 flex items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4"
      >
        <span className="rounded-full bg-amber-500/15 p-2 text-amber-600 dark:text-amber-500">
          <Trophy className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{t("statsTitle")}</p>
          <p className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs">
            {perf.stats.ratingCount > 0 ? (
              <span className="inline-flex items-center gap-1">
                <StarRating rating={perf.stats.ratingAvg} size={12} />
                <span dir="ltr">{perf.stats.ratingAvg}</span>
              </span>
            ) : null}
            <span>
              {t("statDeliveriesCount", { count: perf.stats.deliveries })}
            </span>
            <span>·</span>
            <span>{t("badgesEarnedCount", { count: perf.earnedCount })}</span>
          </p>
        </div>
        <ChevronRight className="text-muted-foreground size-5 rtl:rotate-180" />
      </Link>

      {/* Cash the driver is holding + fees earned → full ledger. */}
      {cash.cashOnHand > 0 || cash.earnings > 0 ? (
        <Link href="/driver/ledger" className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-500">
              <Wallet className="size-3.5" /> {t("cashToRemit")}
            </p>
            <p className="mt-1 text-lg font-semibold" dir="ltr">
              {money(cash.cashOnHand)}
            </p>
            {cod.cashLimit > 0 ? (
              <p className="text-muted-foreground mt-0.5 text-[11px]">
                {t("codLimitLine", { limit: money(cod.cashLimit) })}
              </p>
            ) : null}
          </div>
          <div className="rounded-xl border p-3">
            <p className="text-muted-foreground text-xs font-medium">
              {t("earnings")}
            </p>
            <p className="mt-1 text-lg font-semibold" dir="ltr">
              {money(cash.earnings)}
            </p>
          </div>
        </Link>
      ) : null}
      <PushToggle />

      {/* Vacation mode: pause/resume new work. Loud while paused so the
          driver never wonders why offers stopped. */}
      <PauseToggle paused={me?.courierPausedAt != null} />

      {/* Open job board teaser (docs/EXPRESS-DELIVERY.md §4b): how many
          unassigned parcels are up for grabs right now → /driver/board. */}
      {settings.job_board_enabled ? (
        <Link
          href="/driver/board"
          className={cn(
            "hover:border-primary/50 flex items-center gap-3 rounded-xl border p-4",
            boardCount > 0 && "border-primary/50 bg-primary/5",
          )}
        >
          <span className="bg-primary/10 text-primary rounded-full p-2">
            <PackageSearch className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{t("boardCard")}</p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {t("boardCount", { count: boardCount })}
            </p>
          </div>
          <ChevronRight className="text-muted-foreground size-5 rtl:rotate-180" />
        </Link>
      ) : null}

      {/* COD credit control (lib/cod-guard.ts): blocked drivers see WHY they
          get no new work and how to fix it; near-limit drivers get a heads-up
          before the block lands. */}
      {cod.blocked ? (
        <div className="rounded-xl border border-red-500/50 bg-red-500/10 p-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-red-700 dark:text-red-400">
            <AlertTriangle className="size-4" /> {t("codBlockedTitle")}
          </p>
          <p className="mt-1 text-sm">
            {cod.reason === "overdue"
              ? t("codBlockedOverdue", { amount: money(cod.cashOnHand) })
              : t("codBlockedOverLimit", {
                  amount: money(cod.cashOnHand),
                  limit: money(cod.cashLimit),
                })}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {t("codBlockedHow")}
          </p>
        </div>
      ) : cod.cashLimit > 0 && cod.cashOnHand > 0.8 * cod.cashLimit ? (
        <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-4">
          <p className="flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-500">
            <AlertTriangle className="size-4" />{" "}
            {t("codNearLimit", {
              amount: money(cod.cashOnHand),
              limit: money(cod.cashLimit),
            })}
          </p>
        </div>
      ) : null}

      {/* Skip the morning scrum at the hub: book a collection slot or check
          in on arrival, and see your place in line (docs §44). */}
      <Link
        href="/points"
        className="hover:border-primary/50 flex items-center gap-3 rounded-xl border p-4"
      >
        <span className="rounded-full bg-sky-500/15 p-2 text-sky-600 dark:text-sky-400">
          <UsersRound className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{t("queueCard")}</span>
          <span className="text-muted-foreground block truncate text-xs">
            {t("queueCardHint")}
          </span>
        </span>
        <ChevronRight className="text-muted-foreground size-4 shrink-0 rtl:rotate-180" />
      </Link>

      <LocationShare currentGovernorate={location?.governorate ?? null} />

      <div>
        <h1 className="text-lg font-semibold">{t("myJobs")}</h1>
        <p className="text-muted-foreground text-sm">
          {t("jobsCount", { count: jobs.length })}
        </p>
      </div>

      {jobs.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed py-16 text-center text-sm">
          <PackageCheck className="mx-auto mb-2 size-8 opacity-50" />
          {t("noJobs")}
        </div>
      ) : (
        <ul className="space-y-3">
          {jobs.map((j) => (
            <li key={j.id}>
              <Link
                href={`/driver/job/${j.id}`}
                className={cn(
                  "hover:border-primary/50 flex items-center gap-3 rounded-xl border p-4",
                  j.offers.length > 0 &&
                    "rounded-b-none border-amber-500/50 bg-amber-500/5",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      #{j.subOrder.order.id.slice(-8).toUpperCase()}
                    </span>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[11px] font-medium",
                        j.status === "OUT_FOR_DELIVERY"
                          ? "bg-amber-500/15 text-amber-600"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {tShip(`shipStatus_${j.status}`)}
                    </span>
                    {j.sla === "overdue" ? (
                      <span className="inline-flex items-center gap-1 rounded bg-red-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-red-600">
                        <AlertTriangle className="size-3" /> {t("overdue")}
                      </span>
                    ) : j.sla === "due_soon" ? (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-amber-600">
                        <Clock className="size-3" /> {t("dueSoon")}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-sm font-medium">
                    {j.subOrder.order.address.fullName}
                  </p>
                  <p className="text-muted-foreground flex items-center gap-1 text-xs">
                    <MapPin className="size-3" />
                    {j.subOrder.order.address.city},{" "}
                    {j.subOrder.order.address.governorate}
                  </p>
                  {j.subOrder.order.deliveryDate &&
                  j.subOrder.order.deliverySlot ? (
                    <div className="mt-1">
                      <DeliveryWindowBadge
                        date={j.subOrder.order.deliveryDate}
                        slot={j.subOrder.order.deliverySlot}
                      />
                    </div>
                  ) : null}
                </div>
                <ChevronRight className="text-muted-foreground size-5 rtl:rotate-180" />
              </Link>
              {j.offers.length > 0 ? (
                <OfferActions
                  shipmentId={j.id}
                  expiresAt={j.offers[0].expiresAt}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
