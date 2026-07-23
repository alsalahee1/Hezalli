import { getTranslations } from "next-intl/server";
import {
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  PackageCheck,
  Star,
  Trophy,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { requireCourierId } from "@/lib/authz";
import { syncedCourierPerformance } from "@/lib/courier-performance";
import type { BadgeState } from "@/lib/courier-badges";
import { StarRating } from "@/components/product/star-rating";
import { cn } from "@/lib/utils";

const BADGE_ICONS: Record<string, LucideIcon> = {
  top_rated: Star,
  five_star_streak: Zap,
  first_attempt_pro: CheckCircle2,
  on_time_hero: CalendarClock,
  verified_pro: BadgeCheck,
};

// The driver's own scoreboard: the stats admins already see (deliveries,
// rating, on-time %, first-attempt %) plus the badges they power. Everything
// is computed on the fly by lib/courier-performance.ts.
export default async function DriverStatsPage() {
  const courierId = await requireCourierId();
  if (!courierId) return null;
  const t = await getTranslations("Driver");

  const { stats, badges, earnedCount } =
    await syncedCourierPerformance(courierId);
  const earned = badges.filter((b) => b.earned);
  const next = badges.filter((b) => !b.earned);

  const badgeName = (b: BadgeState) =>
    b.kind === "milestone"
      ? t("badge_milestone", { target: b.target })
      : t(`badge_${b.id}`);
  const badgeDesc = (b: BadgeState) =>
    b.kind === "milestone"
      ? t("badgeDesc_milestone", { target: b.target })
      : t(`badgeDesc_${b.id}`);
  const badgeIcon = (b: BadgeState) => BADGE_ICONS[b.id] ?? PackageCheck;

  const pctOrDash = (v: number | null) => (v == null ? "—" : `${v}%`);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <Trophy className="size-5 text-amber-500" /> {t("statsTitle")}
        </h1>
        <p className="text-muted-foreground text-sm">{t("statsSubtitle")}</p>
      </div>

      {/* Headline stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border p-3">
          <p className="text-muted-foreground text-xs font-medium">
            {t("statDeliveries")}
          </p>
          <p className="mt-1 text-lg font-semibold" dir="ltr">
            {stats.deliveries}
          </p>
        </div>
        <div className="rounded-xl border p-3">
          <p className="text-muted-foreground text-xs font-medium">
            {t("statRating")}
          </p>
          {stats.ratingCount > 0 ? (
            <p className="mt-1 flex items-center gap-1.5">
              <span className="text-lg font-semibold" dir="ltr">
                {stats.ratingAvg}
              </span>
              <StarRating rating={stats.ratingAvg} />
            </p>
          ) : (
            <p className="mt-1 text-lg font-semibold">—</p>
          )}
          <p className="text-muted-foreground mt-0.5 text-[11px]">
            {t("statRatingsCount", { count: stats.ratingCount })}
          </p>
        </div>
        <div className="rounded-xl border p-3">
          <p className="text-muted-foreground text-xs font-medium">
            {t("statOnTime")}
          </p>
          <p className="mt-1 text-lg font-semibold" dir="ltr">
            {pctOrDash(stats.onTimePct)}
          </p>
        </div>
        <div className="rounded-xl border p-3">
          <p className="text-muted-foreground text-xs font-medium">
            {t("statFirstAttempt")}
          </p>
          <p className="mt-1 text-lg font-semibold" dir="ltr">
            {pctOrDash(stats.firstAttemptPct)}
          </p>
        </div>
      </div>

      {/* Earned badges */}
      <div>
        <h2 className="font-semibold">{t("badgesTitle")}</h2>
        <p className="text-muted-foreground text-sm">
          {t("badgesEarnedCount", { count: earnedCount })}
        </p>
      </div>
      {earned.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed px-4 py-10 text-center text-sm">
          <Trophy className="mx-auto mb-2 size-8 opacity-50" />
          {t("badgesEmptyHint")}
        </div>
      ) : (
        <ul className="grid grid-cols-3 gap-3">
          {earned.map((b) => {
            const Icon = badgeIcon(b);
            return (
              <li
                key={b.id}
                className="flex flex-col items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-center"
              >
                <span className="rounded-full bg-amber-500/15 p-2 text-amber-600 dark:text-amber-500">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="text-xs leading-tight font-medium">
                  {badgeName(b)}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {/* Badges still to earn, with progress */}
      {next.length > 0 ? (
        <>
          <h2 className="font-semibold">{t("badgesNextTitle")}</h2>
          <ul className="space-y-3">
            {next.map((b) => {
              const Icon = badgeIcon(b);
              const pct = Math.min(100, (b.current / b.target) * 100);
              return (
                <li key={b.id} className="rounded-xl border p-3">
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground bg-muted rounded-full p-2">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-sm font-medium">{badgeName(b)}</p>
                        <p
                          className="text-muted-foreground text-xs tabular-nums"
                          dir="ltr"
                        >
                          {b.current} / {b.target}
                        </p>
                      </div>
                      <p className="text-muted-foreground text-xs">
                        {badgeDesc(b)}
                      </p>
                    </div>
                  </div>
                  <div className="bg-muted mt-2 h-1.5 overflow-hidden rounded-full">
                    <div
                      className={cn(
                        "bg-primary h-full rounded-full",
                        pct >= 100 && "bg-amber-500",
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </div>
  );
}
