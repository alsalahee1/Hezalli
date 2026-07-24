"use client";

import { useEffect, useState, useTransition } from "react";
import { Fingerprint } from "lucide-react";
import { useTranslations } from "next-intl";

import { loginWithPasskey } from "@/lib/actions/login-passkey";
import {
  browserSupportsWebAuthn,
  getLoginPasskeyAssertion,
} from "@/lib/webauthn-client";
import { Button } from "@/components/ui/button";

// "Sign in with biometrics" — a first-factor passkey login shown on the login
// page beneath the password form. Hidden on browsers without WebAuthn; the
// password form is always the fallback. On success the server action redirects
// (NEXT_REDIRECT), so we only handle the error/cancel paths here.
export function PasskeyLoginButton({ callbackUrl }: { callbackUrl?: string }) {
  const t = useTranslations("Auth");
  const [supported, setSupported] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setSupported(browserSupportsWebAuthn());
  }, []);

  if (!supported) return null;

  const onClick = () =>
    start(async () => {
      setErr(null);
      try {
        const assertion = await getLoginPasskeyAssertion();
        const res = await loginWithPasskey(assertion, callbackUrl);
        if (res?.error) setErr("passkeyFailed");
      } catch {
        // No passkey on this device, or the user dismissed the prompt.
        setErr("passkeyCancelled");
      }
    });

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <span className="bg-border h-px flex-1" />
        <span className="text-muted-foreground text-xs">{t("passkeyOr")}</span>
        <span className="bg-border h-px flex-1" />
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={pending}
        onClick={onClick}
      >
        <Fingerprint className="size-4" />
        {pending ? t("signingIn") : t("passkeySignIn")}
      </Button>

      {err ? (
        <p role="alert" className="text-destructive text-center text-xs">
          {t(err)}
        </p>
      ) : null}
    </div>
  );
}
