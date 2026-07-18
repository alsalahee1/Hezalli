"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { subscribeNewsletter } from "@/lib/actions/newsletter";
import { Button } from "@/components/ui/button";

export function NewsletterSignup() {
  const t = useTranslations("Newsletter");
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "ok" | "error">("idle");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await subscribeNewsletter(email);
      if (res.ok) {
        setState("ok");
        setEmail("");
      } else {
        setState("error");
      }
    });
  };

  return (
    <div className="max-w-xs space-y-2">
      <p className="text-sm font-semibold">{t("title")}</p>
      <p className="text-muted-foreground text-sm">{t("desc")}</p>
      {state === "ok" ? (
        <p className="text-sm text-emerald-600">{t("thanks")}</p>
      ) : (
        <form onSubmit={submit} className="flex gap-2">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setState("idle");
            }}
            placeholder={t("placeholder")}
            aria-label={t("placeholder")}
            className="bg-background h-9 min-w-0 flex-1 rounded-md border px-3 text-sm"
          />
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? t("subscribing") : t("subscribe")}
          </Button>
        </form>
      )}
      {state === "error" ? (
        <p className="text-destructive text-sm">{t("invalid")}</p>
      ) : null}
    </div>
  );
}
