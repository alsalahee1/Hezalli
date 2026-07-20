"use client";

import { useState, useTransition } from "react";
import { KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";

import { setWalletPin } from "@/lib/actions/wallet-pin";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

// Set (or change) the wallet PIN. Shown in a Security panel on the wallet page.
export function WalletPinForm({ hasPin }: { hasPin: boolean }) {
  const t = useTranslations("Wallet");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const digits = (v: string) => v.replace(/\D/g, "");

  const submit = () =>
    start(async () => {
      setErr(null);
      if (!/^\d{4,6}$/.test(pin)) {
        setErr("badPin");
        return;
      }
      if (pin !== confirm) {
        setErr("pinMismatch");
        return;
      }
      const res = await setWalletPin({
        pin,
        currentPin: hasPin ? currentPin : undefined,
      });
      if (res.error) setErr(res.error);
      else {
        setDone(true);
        setCurrentPin("");
        setPin("");
        setConfirm("");
        setOpen(false);
        router.refresh();
      }
    });

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <KeyRound className="text-muted-foreground size-4" />
          <span>{hasPin ? t("pinSetLabel") : t("pinNotSetLabel")}</span>
          {done ? (
            <span className="text-xs text-emerald-600">{t("pinSaved")}</span>
          ) : null}
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          {hasPin ? t("pinChange") : t("pinSet")}
        </Button>
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        closeLabel={t("cancel")}
      >
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <KeyRound className="text-muted-foreground size-4" />
            <h3 className="font-medium">
              {hasPin ? t("pinChange") : t("pinSet")}
            </h3>
          </div>
          {hasPin ? (
            <Input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={currentPin}
              onChange={(e) => setCurrentPin(digits(e.target.value))}
              placeholder={t("pinCurrent")}
              dir="ltr"
            />
          ) : null}
          <Input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(digits(e.target.value))}
            placeholder={t("pinNew")}
            dir="ltr"
          />
          <Input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={confirm}
            onChange={(e) => setConfirm(digits(e.target.value))}
            placeholder={t("pinConfirm")}
            dir="ltr"
          />
          <p className="text-muted-foreground text-xs">{t("pinHint")}</p>
          {err ? (
            <p className="text-destructive text-sm">{t(`err_${err}`)}</p>
          ) : null}
          <div className="flex gap-2">
            <Button disabled={pending || !pin || !confirm} onClick={submit}>
              {pending ? t("submitting") : t("pinSave")}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
