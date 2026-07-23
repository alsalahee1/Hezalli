"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, Repeat, Send, Star, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { BOT_COOKIE } from "@/lib/ai/bot-constants";
import { Link, usePathname } from "@/i18n/navigation";
import { useMountTransition } from "@/components/ui/use-mount-transition";
import { Button } from "@/components/ui/button";
import { ShadiIcon } from "@/components/ai/shadi-icon";

// Switch character: persist the choice in a cookie and reload so the server
// re-resolves the avatar, name, and system-prompt identity.
function switchTo(id: string) {
  document.cookie = `${BOT_COOKIE}=${id}; path=/; max-age=31536000; SameSite=Lax`;
  window.location.reload();
}

type ProductCard = {
  slug: string;
  title: string;
  priceLabel: string;
  compareAtLabel: string | null;
  cover: string | null;
  rating: number;
  ratingCount: number;
  storeName?: string;
  outOfStock: boolean;
};

type Message = {
  role: "user" | "assistant";
  text: string;
  cards?: ProductCard[];
};

type Section =
  "store" | "seller" | "admin" | "wallet" | "driver" | "point" | "fleet";

// Which part of the platform the user is on, from the (locale-stripped)
// pathname. Sent with every message so Shadi tailors its help to the page;
// the API re-checks roles before honouring a privileged section.
function sectionFor(pathname: string): Section {
  if (pathname.startsWith("/seller")) return "seller";
  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/wallet-manager") ||
    pathname.startsWith("/delivery-manager")
  )
    return "admin";
  if (pathname.startsWith("/account/wallet")) return "wallet";
  if (pathname.startsWith("/driver")) return "driver";
  if (pathname.startsWith("/point")) return "point";
  if (pathname.startsWith("/fleet")) return "fleet";
  return "store";
}

type SwitcherBot = { id: string; name: string; avatar: string };

export function AiAssistant({
  botId,
  bots = [],
  greeting,
}: {
  botId?: string;
  bots?: SwitcherBot[];
  greeting?: string;
}) {
  const t = useTranslations("Assistant");
  const locale = useLocale();
  const isRtl = locale === "ar";
  const pathname = usePathname();
  const section = sectionFor(pathname);
  // The active character (from the list the server resolved), and the other one
  // to offer switching to — shown by its own face so the change is obvious.
  const activeBot = bots.find((b) => b.id === botId);
  const otherBot = bots.find((b) => b.id !== botId);
  const name = activeBot?.name || t("title");
  const avatar = activeBot?.avatar || "";

  const [open, setOpen] = useState(false);
  const { mounted, shown } = useMountTransition(open, 200);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the transcript pinned to the newest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    const next: Message[] = [...messages, { role: "user", text }];
    setMessages(next);
    setInput("");
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          locale,
          section,
          messages: next.map((m) => ({ role: m.role, text: m.text })),
        }),
      });

      if (res.status === 503) {
        setError(t("unavailable"));
        return;
      }
      if (res.status === 429) {
        setError(t("busy"));
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = (await res.json()) as {
        text: string;
        cards?: ProductCard[];
      };
      setMessages((m) => [
        ...m,
        { role: "assistant", text: data.text, cards: data.cards },
      ]);
    } catch {
      setError(t("error"));
    } finally {
      setLoading(false);
    }
  }

  // Starter chips match the page: shopping ideas on the storefront, seller
  // questions in the Seller Center, wallet questions in HezalliPay, and so on.
  const suggestions =
    section === "store"
      ? [t("suggest1"), t("suggest2"), t("suggest3")]
      : [1, 2, 3].map((n) => t(`suggest_${section}${n}`));

  return (
    <>
      {/* Launcher */}
      <button
        type="button"
        aria-label={t("open")}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          // Sit above the mobile bottom tab bar (~4rem tall) on phones, drop
          // back to the normal corner offset once the tab bar hides at `md`.
          "bg-primary text-primary-foreground fixed bottom-20 z-50 flex size-14 items-center justify-center overflow-hidden rounded-full shadow-lg transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none md:bottom-4",
          isRtl ? "left-4" : "right-4",
        )}
      >
        {open ? (
          <X className="size-6" />
        ) : avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt="" className="size-full object-cover" />
        ) : (
          <ShadiIcon className="size-6" />
        )}
      </button>

      {/* Panel */}
      {mounted && (
        <div
          dir={isRtl ? "rtl" : "ltr"}
          className={cn(
            "bg-background fixed bottom-36 z-50 flex h-[min(70vh,32rem)] w-[min(92vw,24rem)] transform-gpu flex-col overflow-hidden rounded-2xl border shadow-2xl transition duration-200 ease-out will-change-transform motion-reduce:transition-none md:bottom-20",
            isRtl ? "left-4 origin-bottom-left" : "right-4 origin-bottom-right",
            shown ? "scale-100 opacity-100" : "scale-95 opacity-0",
          )}
        >
          {/* Header */}
          <div className="bg-primary text-primary-foreground flex items-center gap-2 px-4 py-3">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatar}
                alt=""
                className="border-primary-foreground/30 size-8 shrink-0 rounded-full border bg-white object-cover"
              />
            ) : (
              <Bot className="size-5" />
            )}
            <div className="flex-1">
              <p className="text-sm leading-tight font-semibold">{name}</p>
              <p className="text-primary-foreground/80 text-xs">
                {t("subtitle")}
              </p>
            </div>
            {otherBot ? (
              <button
                type="button"
                aria-label={t("switchTo", { name: otherBot.name })}
                title={t("switchTo", { name: otherBot.name })}
                onClick={() => switchTo(otherBot.id)}
                className="hover:bg-primary-foreground/10 focus-visible:ring-primary-foreground/60 relative rounded-full p-0.5 transition focus-visible:ring-2 focus-visible:outline-none"
              >
                {/* The other character's face, so it's clear who you'd switch
                    to; a small swap badge marks it as a switch action. */}
                {otherBot.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={otherBot.avatar}
                    alt=""
                    className="border-primary-foreground/40 size-8 rounded-full border bg-white object-cover opacity-90 grayscale transition hover:opacity-100 hover:grayscale-0"
                  />
                ) : (
                  <Repeat className="size-4" />
                )}
                <span className="bg-background text-primary absolute -end-0.5 -bottom-0.5 flex size-3.5 items-center justify-center rounded-full shadow">
                  <Repeat className="size-2.5" />
                </span>
              </button>
            ) : null}
            <button
              type="button"
              aria-label={t("close")}
              onClick={() => setOpen(false)}
              className="hover:bg-primary-foreground/10 rounded-md p-1"
            >
              <X className="size-5" />
            </button>
          </div>

          {/* Transcript */}
          <div
            ref={scrollRef}
            className="flex-1 space-y-3 overflow-y-auto px-3 py-3"
          >
            {messages.length === 0 && (
              <div className="text-muted-foreground space-y-3 py-4 text-center text-sm">
                {avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatar}
                    alt=""
                    className="border-primary/20 mx-auto size-14 rounded-full border object-cover"
                  />
                ) : (
                  <ShadiIcon className="text-primary mx-auto size-8" />
                )}
                <p className="whitespace-pre-line">
                  {greeting?.trim() || t("greeting", { name })}
                </p>
                <div className="flex flex-col gap-2">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setInput(s)}
                      className="hover:bg-accent rounded-md border px-3 py-1.5 text-start text-xs"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className="space-y-2">
                <div
                  className={cn(
                    "flex",
                    m.role === "user" ? "justify-end" : "justify-start",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap",
                      m.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground",
                    )}
                  >
                    {m.text}
                  </div>
                </div>

                {m.cards && m.cards.length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    {m.cards.map((c) => (
                      <Link
                        key={c.slug}
                        href={`/product/${c.slug}`}
                        onClick={() => setOpen(false)}
                        className="hover:border-primary group rounded-lg border p-2 transition-colors"
                      >
                        <div className="bg-muted mb-1.5 aspect-square overflow-hidden rounded-md">
                          {c.cover ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={c.cover}
                              alt={c.title}
                              className="size-full object-cover"
                            />
                          ) : null}
                        </div>
                        <p className="line-clamp-2 text-xs font-medium">
                          {c.title}
                        </p>
                        <p className="text-primary text-sm font-semibold">
                          {c.priceLabel}
                        </p>
                        {c.compareAtLabel && (
                          <p className="text-muted-foreground text-xs line-through">
                            {c.compareAtLabel}
                          </p>
                        )}
                        {c.ratingCount > 0 && (
                          <p className="text-muted-foreground flex items-center gap-0.5 text-xs">
                            <Star className="size-3 fill-amber-400 text-amber-400" />
                            {c.rating.toFixed(1)} ({c.ratingCount})
                          </p>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-muted flex items-center gap-2 rounded-2xl px-3 py-2 text-sm">
                  <Loader2 className="size-4 animate-spin" />
                  {t("thinking")}
                </div>
              </div>
            )}

            {error && (
              <p className="text-destructive px-2 text-center text-xs">
                {error}
              </p>
            )}
          </div>

          {/* Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="flex items-center gap-2 border-t p-2"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("placeholder")}
              maxLength={2000}
              className="border-input bg-background focus-visible:ring-ring h-9 flex-1 rounded-md border px-3 text-sm outline-none focus-visible:ring-2"
            />
            <Button
              type="submit"
              size="icon"
              disabled={loading || !input.trim()}
              aria-label={t("send")}
            >
              <Send className="size-4" />
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
