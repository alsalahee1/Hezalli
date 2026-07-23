"use client";

import { useEffect, useState, useTransition } from "react";
import { Fingerprint, KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";

import { setWalletPin } from "@/lib/actions/wallet-pin";
import { browserSupportsWebAuthn, enrollPasskey } from "@/lib/webauthn-client";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

/**
 * One-window wallet-security setup: a PIN form and a biometrics toggle in a
 * single dialog, reusing the same server actions as the account Security page
 * (setWalletPin, enrollPasskey). Meant for the payment surfaces (driver ledger,
 * wallet forms) where sending the user to /account/security dropped them onto
 * the account password form — confusing, and a footgun for changing the wrong
 * password. The caller supplies the trigger; on success the dialog closes and
 * the page refreshes so the now-authorized form reappears.
 */
export function WalletSecurityDialog({
  hasPin,
  hasPasskey,
  className,
  children,
}: {
  hasPin: boolean;
  hasPasskey: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("Wallet");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [supported, setSupported] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setSupported(browserSupportsWebAuthn());
  }, []);

  const digits = (v: string) => v.replace(/\D/g, "");

  const done = () => {
    setCurrentPin("");
    setPin("");
    setConfirm("");
    setErr(null);
    setOpen(false);
    router.refresh();
  };

  const savePin = () =>
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
      else done();
    });

  const enableBiometrics = () =>
    start(async () => {
      setErr(null);
      try {
        const res = await enrollPasskey();
        if (res.error) setErr(res.error);
        else done();
      } catch {
        setErr("biometricFailed");
      }
    });

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} closeLabel={t("cancel")}>
        <div className="space-y-4">
          <div>
            <h3 className="flex items-center gap-2 font-semibold">
              <KeyRound className="text-muted-foreground size-4" />
              {t("securitySetupTitle")}
            </h3>
            <p className="text-muted-foreground mt-1 text-sm">
              {t("authRequiredNotice")}
            </p>
          </div>

          {/* PIN */}
          <div className="space-y-2">
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
            <Button
              className="w-full"
              disabled={pending || !pin || !confirm}
              onClick={savePin}
            >
              {pending ? t("submitting") : t("pinSave")}
            </Button>
          </div>

          {/* Biometrics — offered when the device supports it and none is set. */}
          {supported && !hasPasskey ? (
            <>
              <div className="flex items-center gap-3">
                <span className="bg-border h-px flex-1" />
                <span className="text-muted-foreground text-xs">
                  {t("securityOr")}
                </span>
                <span className="bg-border h-px flex-1" />
              </div>
              <Button
                variant="outline"
                className="w-full"
                disabled={pending}
                onClick={enableBiometrics}
              >
                <Fingerprint className="size-4" /> {t("biometricAdd")}
              </Button>
            </>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
