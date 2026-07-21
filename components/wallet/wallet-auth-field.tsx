"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import {
  browserSupportsWebAuthn,
  getPasskeyAssertion,
} from "@/lib/webauthn-client";
import type { WalletAuth } from "@/lib/wallet-step-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// The single authorization control used by every wallet outflow form. Offers
// biometric (passkey) as the fast path with the PIN as fallback, and hands the
// chosen credential back to the form via onAuthorize. The form owns the actual
// server-action call so this component stays layout-agnostic.
export function WalletAuthField({
  hasPin,
  hasPasskey,
  disabled,
  pending,
  error,
  submitLabel,
  onAuthorize,
  onCancel,
  fullWidth,
}: {
  hasPin: boolean;
  hasPasskey: boolean;
  disabled?: boolean; // form-field validity gate (e.g. amount empty)
  pending?: boolean; // parent transition in flight
  error?: string | null; // action error key (shown via err_<key>)
  submitLabel: string;
  onAuthorize: (auth: WalletAuth) => void;
  onCancel?: () => void;
  fullWidth?: boolean;
}) {
  const t = useTranslations("Wallet");
  const [supported, setSupported] = useState(false);
  const [mode, setMode] = useState<"biometric" | "pin">("pin");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);

  const canBiometric = hasPasskey && supported;

  useEffect(() => {
    setSupported(browserSupportsWebAuthn());
  }, []);
  useEffect(() => {
    setMode(canBiometric ? "biometric" : "pin");
  }, [canBiometric]);

  const runBiometric = async () => {
    setLocalErr(null);
    setBusy(true);
    try {
      const passkey = await getPasskeyAssertion();
      onAuthorize({ passkey });
    } catch {
      // Biometric failed or was dismissed — fall back to PIN entry silently so
      // the user can just type their PIN instead. Only surface an error when
      // there's no PIN to fall back to.
      if (hasPin) setMode("pin");
      else setLocalErr("biometricFailed");
    } finally {
      setBusy(false);
    }
  };

  const btnClass = fullWidth ? "w-full" : "";
  const errKey = localErr ?? error;

  // Neither method available yet — prompt the user to set one up first.
  if (!hasPin && !canBiometric) {
    return (
      <p className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5 text-xs text-amber-700 dark:text-amber-400">
        {t("authRequiredNotice")}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {mode === "pin" ? (
        <Input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          placeholder={t("pinPlaceholder")}
          dir="ltr"
        />
      ) : null}

      {errKey ? (
        <p className="text-destructive text-sm">{t(`err_${errKey}`)}</p>
      ) : null}

      <div className="flex gap-2">
        {mode === "biometric" ? (
          // A plain action button (Send / Confirm). Tapping it opens the
          // biometric prompt; if that's dismissed or fails, the PIN field
          // appears so the user can authorize by PIN instead.
          <Button
            className={btnClass}
            disabled={disabled || pending || busy}
            onClick={runBiometric}
          >
            {pending || busy ? t("submitting") : submitLabel}
          </Button>
        ) : (
          <Button
            className={btnClass}
            disabled={disabled || pending || pin.length < 4}
            onClick={() => onAuthorize({ pin })}
          >
            {pending ? t("submitting") : submitLabel}
          </Button>
        )}
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel}>
            {t("cancel")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
