"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import {
  requestPasswordReset,
  type RequestResetState,
} from "@/lib/actions/password-reset";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ForgotPasswordForm() {
  const t = useTranslations("Auth");
  const [state, formAction, pending] = useActionState<
    RequestResetState,
    FormData
  >(requestPasswordReset, {});

  // Confirmation view: shown for any valid submission, whether or not the email
  // is registered, so the form never reveals which addresses have accounts.
  if (state.sent) {
    return (
      <div className="space-y-4 text-center">
        <p
          role="status"
          className="bg-muted text-muted-foreground rounded-md px-3 py-3 text-sm"
        >
          {t("resetSent")}
        </p>
        <Link
          href="/login"
          className="text-foreground text-sm font-medium hover:underline"
        >
          {t("backToLogin")}
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.formError ? (
        <p
          role="alert"
          className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
        >
          {t(state.formError)}
        </p>
      ) : null}

      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm font-medium">
          {t("email")}
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={Boolean(state.errors?.email)}
        />
        {state.errors?.email ? (
          <p className="text-destructive text-xs">{t(state.errors.email)}</p>
        ) : null}
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t("sendingResetLink") : t("sendResetLink")}
      </Button>

      <p className="text-muted-foreground text-center text-sm">
        <Link
          href="/login"
          className="text-foreground font-medium hover:underline"
        >
          {t("backToLogin")}
        </Link>
      </p>
    </form>
  );
}
