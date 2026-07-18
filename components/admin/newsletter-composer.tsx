"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { broadcastNewsletter } from "@/lib/actions/newsletter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function NewsletterComposer({ activeCount }: { activeCount: number }) {
  const t = useTranslations("AdminNewsletter");
  const [pending, start] = useTransition();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [result, setResult] = useState<
    { sent: number } | { error: string } | null
  >(null);

  const send = () =>
    start(async () => {
      setResult(null);
      const res = await broadcastNewsletter(subject, body);
      if (res.error) setResult({ error: res.error });
      else {
        setResult({ sent: res.sent ?? 0 });
        setSubject("");
        setBody("");
      }
    });

  const disabled = pending || activeCount === 0;

  return (
    <div className="max-w-xl space-y-3 rounded-lg border p-5">
      <div>
        <h2 className="font-medium">{t("compose")}</h2>
        <p className="text-muted-foreground text-sm">
          {t("composeDesc", { count: activeCount })}
        </p>
      </div>
      <Input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder={t("subjectPlaceholder")}
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t("bodyPlaceholder")}
        rows={6}
        className="bg-background w-full rounded-md border p-3 text-sm"
      />
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={send} disabled={disabled}>
          {pending ? t("sending") : t("send")}
        </Button>
        {result ? (
          "error" in result ? (
            <span className="text-destructive text-sm">
              {t(`err_${result.error}`)}
            </span>
          ) : (
            <span className="text-sm text-emerald-600">
              {t("sentToast", { count: result.sent })}
            </span>
          )
        ) : null}
      </div>
    </div>
  );
}
