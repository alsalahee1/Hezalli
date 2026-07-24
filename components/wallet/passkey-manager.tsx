"use client";

import { useEffect, useState, useTransition } from "react";
import { Fingerprint, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { removePasskey } from "@/lib/actions/wallet-passkey";
import { browserSupportsWebAuthn, enrollPasskey } from "@/lib/webauthn-client";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

type Passkey = { id: string; label: string | null };

// Enrol / manage biometric passkeys for wallet step-up. Shown in the wallet
// Security panel beside the PIN control.
export function PasskeyManager({ passkeys }: { passkeys: Passkey[] }) {
  const t = useTranslations("Wallet");
  const router = useRouter();
  const [supported, setSupported] = useState(true);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setSupported(browserSupportsWebAuthn());
  }, []);

  const add = () =>
    start(async () => {
      setErr(null);
      try {
        const res = await enrollPasskey();
        if (res.error) setErr(res.error);
        else router.refresh();
      } catch {
        setErr("biometricFailed");
      }
    });

  const remove = (id: string) =>
    start(async () => {
      await removePasskey(id);
      router.refresh();
    });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <Fingerprint className="text-muted-foreground size-4" />
          <span>
            {passkeys.length > 0 ? t("biometricOn") : t("biometricOff")}
          </span>
        </div>
        {supported ? (
          <Button size="sm" variant="outline" disabled={pending} onClick={add}>
            {pending ? t("submitting") : t("biometricAdd")}
          </Button>
        ) : (
          <span className="text-muted-foreground text-xs">
            {t("biometricUnsupported")}
          </span>
        )}
      </div>

      {passkeys.length > 0 ? (
        <ul className="divide-y rounded-md border">
          {passkeys.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
            >
              <span>{p.label || t("biometricDevice")}</span>
              <button
                type="button"
                className="text-muted-foreground hover:text-destructive flex size-9 items-center justify-center"
                disabled={pending}
                onClick={() => remove(p.id)}
                aria-label={t("biometricRemove")}
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {err ? (
        <p className="text-destructive text-xs">{t(`err_${err}`)}</p>
      ) : null}
    </div>
  );
}
