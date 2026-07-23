"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { BOT_COOKIE } from "@/lib/ai/bot-constants";

export type SwitcherBot = { id: string; name: string; avatar: string };

/**
 * Lets a shopper choose which assistant character they chat with. The choice
 * is a cookie (works signed-in or not); we reload so the widget, avatar, and
 * the assistant's own identity all update from the server.
 */
export function BotSwitcher({
  bots,
  active,
}: {
  bots: SwitcherBot[];
  active: string;
}) {
  const t = useTranslations("BotSwitcher");

  const choose = (id: string) => {
    if (id === active) return;
    document.cookie = `${BOT_COOKIE}=${id}; path=/; max-age=31536000; SameSite=Lax`;
    window.location.reload();
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {bots.map((bot) => {
        const selected = bot.id === active;
        return (
          <button
            key={bot.id}
            type="button"
            onClick={() => choose(bot.id)}
            aria-pressed={selected}
            className={cn(
              "flex items-center gap-3 rounded-xl border p-3 text-start transition-colors",
              selected
                ? "border-primary bg-primary/5"
                : "hover:border-primary/40 hover:bg-muted",
            )}
          >
            <div className="bg-muted size-14 shrink-0 overflow-hidden rounded-full border">
              {bot.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={bot.avatar}
                  alt=""
                  className="size-full object-cover"
                />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{bot.name}</p>
              <p className="text-muted-foreground text-xs">
                {selected ? t("active") : t("choose")}
              </p>
            </div>
            {selected ? <Check className="text-primary size-5" /> : null}
          </button>
        );
      })}
    </div>
  );
}
