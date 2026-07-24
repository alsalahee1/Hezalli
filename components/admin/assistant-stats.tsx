"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle, MessageSquare, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import type { AssistantStats } from "@/lib/ai/stats";

type BotMeta = { name: string; avatar: string };

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function AssistantStatsView({
  stats,
  bots,
}: {
  stats: AssistantStats;
  bots: Record<string, BotMeta>;
}) {
  const t = useTranslations("AssistantStats");

  if (stats.totalMessages === 0) {
    return (
      <div className="text-muted-foreground rounded-lg border p-8 text-center text-sm">
        {t("empty")}
      </div>
    );
  }

  const sectionLabel = (s: string) => {
    const key = `sec_${s}`;
    const label = t(key);
    return label === key ? s : label;
  };

  // Colour per character (first = primary, others = amber) for the chart.
  const botColor = (i: number) => (i === 0 ? "bg-primary" : "bg-amber-500");
  const maxDay = Math.max(
    1,
    ...stats.daily.map((d) =>
      Object.values(d.counts).reduce((a, b) => a + b, 0),
    ),
  );

  return (
    <div className="space-y-6">
      {/* Totals */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Tile
          icon={<MessageSquare className="size-4" />}
          label={t("totalMessages")}
          value={stats.totalMessages.toLocaleString()}
        />
        <Tile
          icon={<Users className="size-4" />}
          label={t("totalUsers")}
          value={stats.totalUsers.toLocaleString()}
        />
      </div>

      {/* Per-character cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {stats.perBot.map((b, i) => {
          const meta = bots[b.bot];
          return (
            <section key={b.bot} className="space-y-4 rounded-lg border p-4">
              <div className="flex items-center gap-3">
                <span className="bg-muted size-11 shrink-0 overflow-hidden rounded-full border">
                  {meta?.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={meta.avatar}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : null}
                </span>
                <div>
                  <p className="font-semibold">{meta?.name ?? b.bot}</p>
                  <p className="text-muted-foreground text-xs">
                    {t("tokens", {
                      n: (b.tokensIn + b.tokensOut).toLocaleString(),
                    })}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Metric
                  label={t("messages")}
                  value={b.messages.toLocaleString()}
                  share={b.messageShare}
                  color={botColor(i)}
                />
                <Metric
                  label={t("users")}
                  value={b.users.toLocaleString()}
                  share={b.userShare}
                  color={botColor(i)}
                />
              </div>

              {/* Couldn't-answer rate — the quality signal. */}
              <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span className="text-muted-foreground">{t("needsRate")}</span>
                <span
                  className={cn(
                    "font-semibold",
                    b.fallbackRate >= 0.2
                      ? "text-destructive"
                      : b.fallbackRate >= 0.1
                        ? "text-amber-600"
                        : "text-emerald-600",
                  )}
                  dir="ltr"
                >
                  {pct(b.fallbackRate)} ({b.fallbacks})
                </span>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-medium">{t("topPages")}</p>
                {b.topSections.length ? (
                  <ul className="space-y-1">
                    {b.topSections.map((s) => (
                      <li
                        key={s.section}
                        className="flex items-center justify-between text-sm"
                      >
                        <span>{sectionLabel(s.section)}</span>
                        <span className="text-muted-foreground" dir="ltr">
                          {s.count}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground text-xs">{t("none")}</p>
                )}
              </div>

              <div>
                <p className="mb-1.5 text-xs font-medium">
                  {t("topQuestions")}
                </p>
                {b.topQuestions.length ? (
                  <ol className="space-y-1">
                    {b.topQuestions.map((q, qi) => (
                      <li
                        key={qi}
                        className="flex items-start justify-between gap-2 text-sm"
                      >
                        <span className="line-clamp-1">{q.question}</span>
                        <span
                          className="text-muted-foreground shrink-0"
                          dir="ltr"
                        >
                          ×{q.count}
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-muted-foreground text-xs">{t("none")}</p>
                )}
              </div>

              {b.needsAttention.length ? (
                <div>
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-amber-600">
                    <AlertTriangle className="size-3.5" />
                    {t("needsAttention")}
                  </p>
                  <ol className="space-y-1">
                    {b.needsAttention.map((q, qi) => (
                      <li
                        key={qi}
                        className="flex items-start justify-between gap-2 text-sm"
                      >
                        <span className="line-clamp-1">{q.question}</span>
                        <span
                          className="text-muted-foreground shrink-0"
                          dir="ltr"
                        >
                          ×{q.count}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>

      {/* Daily volume */}
      <section className="space-y-3 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">{t("daily")}</p>
          <div className="flex items-center gap-3 text-xs">
            {stats.perBot.map((b, i) => (
              <span key={b.bot} className="flex items-center gap-1.5">
                <span className={cn("size-2.5 rounded-full", botColor(i))} />
                {bots[b.bot]?.name ?? b.bot}
              </span>
            ))}
          </div>
        </div>
        <div className="flex h-28 items-end gap-0.5">
          {stats.daily.map((d) => {
            const total = Object.values(d.counts).reduce((a, b) => a + b, 0);
            return (
              <div
                key={d.day}
                className="flex flex-1 flex-col justify-end"
                title={`${d.day}: ${total}`}
              >
                <div className="flex flex-col-reverse">
                  {stats.perBot.map((b, i) => {
                    const c = d.counts[b.bot] ?? 0;
                    if (!c) return null;
                    return (
                      <div
                        key={b.bot}
                        className={botColor(i)}
                        style={{ height: `${(c / maxDay) * 100}px` }}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Tile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-4">
      <span className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-full">
        {icon}
      </span>
      <div>
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="text-lg font-semibold" dir="ltr">
          {value}
        </p>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  share,
  color,
}: {
  label: string;
  value: string;
  share: number;
  color: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-muted-foreground text-xs">{label}</span>
        <span className="text-sm font-semibold" dir="ltr">
          {value}
        </span>
      </div>
      <div className="bg-muted h-1.5 overflow-hidden rounded-full">
        <div
          className={cn("h-full rounded-full", color)}
          style={{ width: pct(share) }}
        />
      </div>
      <p className="text-muted-foreground text-[11px]" dir="ltr">
        {pct(share)}
      </p>
    </div>
  );
}
