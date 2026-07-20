"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, Send, Sparkles, Star, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { Link } from "@/i18n/navigation";
import { useMountTransition } from "@/components/ui/use-mount-transition";
import { Button } from "@/components/ui/button";

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

export function AiAssistant() {
  const t = useTranslations("Assistant");
  const locale = useLocale();
  const isRtl = locale === "ar";

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

  const suggestions = [t("suggest1"), t("suggest2"), t("suggest3")];

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
          "bg-primary text-primary-foreground fixed bottom-20 z-50 flex size-14 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none md:bottom-4",
          isRtl ? "left-4" : "right-4",
        )}
      >
        {open ? <X className="size-6" /> : <Sparkles className="size-6" />}
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
            <Bot className="size-5" />
            <div className="flex-1">
              <p className="text-sm leading-tight font-semibold">
                {t("title")}
              </p>
              <p className="text-primary-foreground/80 text-xs">
                {t("subtitle")}
              </p>
            </div>
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
                <Sparkles className="text-primary mx-auto size-8" />
                <p>{t("greeting")}</p>
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
