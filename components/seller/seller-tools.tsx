"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { setAutoReply, setVacation } from "@/lib/actions/seller-tools";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SellerToolsForm({
  isOnVacation,
  vacationMessage,
  autoReplyMessage,
}: {
  isOnVacation: boolean;
  vacationMessage: string;
  autoReplyMessage: string;
}) {
  const t = useTranslations("SellerTools");
  const router = useRouter();
  const [pending, start] = useTransition();

  const [onVacation, setOnVacation] = useState(isOnVacation);
  const [vacMsg, setVacMsg] = useState(vacationMessage);
  const [reply, setReply] = useState(autoReplyMessage);
  const [savedVac, setSavedVac] = useState(false);
  const [savedReply, setSavedReply] = useState(false);

  const saveVacation = () =>
    start(async () => {
      await setVacation(onVacation, vacMsg);
      setSavedVac(true);
      setTimeout(() => setSavedVac(false), 1500);
      router.refresh();
    });
  const saveReply = () =>
    start(async () => {
      await setAutoReply(reply);
      setSavedReply(true);
      setTimeout(() => setSavedReply(false), 1500);
      router.refresh();
    });

  return (
    <>
      {/* Vacation mode */}
      <section className="space-y-3 rounded-lg border p-5">
        <div>
          <h2 className="font-medium">{t("vacationTitle")}</h2>
          <p className="text-muted-foreground text-sm">{t("vacationDesc")}</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={onVacation}
            onChange={(e) => setOnVacation(e.target.checked)}
          />
          {t("vacationToggle")}
        </label>
        <Input
          value={vacMsg}
          onChange={(e) => setVacMsg(e.target.value)}
          placeholder={t("vacationPlaceholder")}
          disabled={!onVacation}
        />
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={saveVacation} disabled={pending}>
            {t("save")}
          </Button>
          {savedVac ? (
            <span className="text-sm text-emerald-600">{t("saved")}</span>
          ) : null}
        </div>
      </section>

      {/* Chat auto-reply */}
      <section className="space-y-3 rounded-lg border p-5">
        <div>
          <h2 className="font-medium">{t("autoReplyTitle")}</h2>
          <p className="text-muted-foreground text-sm">{t("autoReplyDesc")}</p>
        </div>
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder={t("autoReplyPlaceholder")}
          rows={3}
          className="bg-background w-full rounded-md border p-3 text-sm"
        />
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={saveReply} disabled={pending}>
            {t("save")}
          </Button>
          {savedReply ? (
            <span className="text-sm text-emerald-600">{t("saved")}</span>
          ) : null}
        </div>
      </section>
    </>
  );
}
