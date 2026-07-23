import { getFormatter, getTranslations } from "next-intl/server";
import {
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  PackageCheck,
  Star,
  Trophy,
  Wallet,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { requireCourierId } from "@/lib/authz";
import {
  syncedCourierPerformance,
  weeklyLeaderboard,
} from "@/lib/courier-performance";
import type { BadgeState } from "@/lib/courier-badges";
import { getPlatformSettings } from "@/lib/settings";
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

  const format = await getFormatter();
  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

  const [{ stats, badges, earnedCount }, settings, board] = await Promise.all([
    syncedCourierPerformance(courierId),
    getPlatformSettings(),
    weeklyLeaderboard(courierId),
  ]);
  const earned = badges.filter((b) => b.earned);
  const next = badges.filter((b) => !b.earned);

  // Badge → COD limit perk (lib/cod-guard.ts): earned quality badges raise
  // the driver's cash limit. Surface the running total (or the incentive
  // while none are earned yet) so the perk actually motivates.
  const perkOn =
    settings.badge_bonus_usd > 0 && settings.badge_bonus_cap_usd > 0;
  const qualityEarned = earned.filter((b) => b.kind !== "milestone").length;
  const badgeBonus = perkOn
    ? Math.min(
        qualityEarned * settings.badge_bonus_usd,
        settings.badge_bonus_cap_usd,
      )
    : 0;

  const badgeName = (b: BadgeState) =>
    b.kind === "seasonal"
      ? (b.label ?? b.id)
      : b.kind === "milestone"
        ? t("badge_milestone", { target: b.target })
        : t(`badge_${b.id}`);
  const badgeDesc = (b: BadgeState) =>
    b.kind === "seasonal"
      ? t("badgeDesc_seasonal", { target: b.target, name: b.label ?? b.id })
      : b.kind === "milestone"
        ? t("badgeDesc_milestone", { target: b.target })
        : t(`badgeDesc_${b.id}`);
  const badgeIcon = (b: BadgeState) =>
    b.kind === "seasonal" ? Trophy : (BADGE_ICONS[b.id] ?? PackageCheck);

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

      {/* COD-limit perk from quality badges */}
      {perkOn ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm">
          <Wallet className="size-4 shrink-0 text-emerald-600" />
          <p>
            {badgeBonus > 0
              ? t("badgePerkActive", { amount: money(badgeBonus) })
              : t("badgePerkHint", {
                  amount: money(settings.badge_bonus_usd),
                  cap: money(settings.badge_bonus_cap_usd),
                })}
          </p>
        </div>
      ) : null}

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

      {/* Weekly leaderboard — friendly competition, first names only. */}
      <h2 className="font-semibold">{t("leaderboardTitle")}</h2>
      {board.rows.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed px-4 py-8 text-center text-sm">
          {t("leaderboardEmpty")}
        </div>
      ) : (
        <div className="rounded-xl border">
          <ol>
            {board.rows.map((r, i) => {
              const me = r.courierId === courierId;
              return (
                <li
                  key={r.courierId}
                  className={cn(
                    "flex items-center gap-3 border-b px-4 py-2.5 text-sm last:border-b-0",
                    me && "bg-amber-500/5",
                  )}
                >
                  <span
                    className={cn(
                      "w-6 text-center font-semibold tabular-nums",
                      i === 0 ? "text-amber-500" : "text-muted-foreground",
                    )}
                    dir="ltr"
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {me ? t("leaderboardYou") : r.name}
                  </span>
                  {r.rating != null ? (
                    <StarRating rating={r.rating} size={12} />
                  ) : null}
                  <span
                    className="text-muted-foreground text-xs tabular-nums"
                    dir="ltr"
                  >
                    {t("statDeliveriesCount", { count: r.deliveries })}
                  </span>
                </li>
              );
            })}
          </ol>
          {board.myRank != null && board.myRank > board.rows.length ? (
            <p className="text-muted-foreground border-t px-4 py-2.5 text-xs">
              {t("leaderboardMyRank", {
                rank: board.myRank,
                count: board.myDeliveries,
              })}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
