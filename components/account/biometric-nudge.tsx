"use client";

import { useEffect, useState, useTransition } from "react";
import { Fingerprint, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { browserSupportsWebAuthn, enrollPasskey } from "@/lib/webauthn-client";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "hz_biometric_nudge_dismissed";

// One-click prompt to enrol a passkey, shown on the account hub only when the
// browser supports WebAuthn and the user has no passkey yet. Enrolling here (or
// dismissing) hides it for good on this device. The password login is always
// available, so this is a pure convenience nudge.
export function BiometricNudge({ hasPasskey }: { hasPasskey: boolean }) {
  const t = useTranslations("Account");
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (hasPasskey || !browserSupportsWebAuthn()) return;
    if (localStorage.getItem(DISMISS_KEY) === "1") return;
    setShow(true);
  }, [hasPasskey]);

  if (!show) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setShow(false);
  };

  const enroll = () =>
    start(async () => {
      setErr(false);
      try {
        const res = await enrollPasskey();
        if (res.error) {
          setErr(true);
          return;
        }
        localStorage.setItem(DISMISS_KEY, "1");
        setShow(false);
        router.refresh();
      } catch {
        setErr(true);
      }
    });

  return (
    <div className="border-primary/30 bg-primary/5 flex items-start gap-3 rounded-lg border p-4">
      <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
        <Fingerprint className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{t("biometricNudgeTitle")}</p>
        <p className="text-muted-foreground text-sm">
          {t("biometricNudgeDesc")}
        </p>
        {err ? (
          <p className="text-destructive mt-1 text-xs">
            {t("biometricNudgeError")}
          </p>
        ) : null}
        <div className="mt-2">
          <Button size="sm" disabled={pending} onClick={enroll}>
            {pending ? t("biometricNudgeWorking") : t("biometricNudgeCta")}
          </Button>
        </div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("dismiss")}
        className="text-muted-foreground hover:text-foreground shrink-0"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
