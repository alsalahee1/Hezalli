"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Link2, Send, Unlink } from "lucide-react";
import { useTranslations } from "next-intl";

import { linkBotAccount, unlinkBotAccount } from "@/lib/actions/bot-link";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export function LinkTelegram({
  code,
  linked,
}: {
  code?: string;
  linked: boolean;
}) {
  const t = useTranslations("BotLink");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<
    { kind: "ok" } | { kind: "error"; msg: string } | null
  >(null);

  function confirm() {
    if (!code) return;
    start(async () => {
      const res = await linkBotAccount(code);
      if (res.ok) {
        setStatus({ kind: "ok" });
        router.refresh();
      } else {
        setStatus({ kind: "error", msg: t(`error_${res.error ?? "invalid"}`) });
      }
    });
  }

  function unlink() {
    start(async () => {
      await unlinkBotAccount("telegram");
      setStatus(null);
      router.refresh();
    });
  }

  // Coming from the bot's deep link (a code is present) and not yet confirmed.
  if (code && status?.kind !== "ok") {
    return (
      <div className="space-y-4 rounded-lg border p-4">
        <p className="text-sm">{t("confirmPrompt")}</p>
        {status?.kind === "error" && (
          <p className="text-destructive text-sm">{status.msg}</p>
        )}
        <Button onClick={confirm} disabled={pending}>
          <Link2 className="size-4" />
          {t("confirmButton")}
        </Button>
      </div>
    );
  }

  if (linked || status?.kind === "ok") {
    return (
      <div className="space-y-4 rounded-lg border p-4">
        <p className="text-primary flex items-center gap-2 text-sm font-medium">
          <CheckCircle2 className="size-4" />
          {t("linked")}
        </p>
        <p className="text-muted-foreground text-sm">{t("linkedHelp")}</p>
        <Button variant="outline" onClick={unlink} disabled={pending}>
          <Unlink className="size-4" />
          {t("unlink")}
        </Button>
      </div>
    );
  }

  // Not linked and no code — show how to start from the bot.
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <Send className="size-4" />
        {t("notLinked")}
      </p>
      <ol className="text-muted-foreground list-inside list-decimal space-y-1 text-sm">
        <li>{t("step1")}</li>
        <li>{t("step2")}</li>
        <li>{t("step3")}</li>
      </ol>
    </div>
  );
}
