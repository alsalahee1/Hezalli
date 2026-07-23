"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import {
  resetPassword,
  type ResetFormState,
} from "@/lib/actions/password-reset";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations("Auth");
  const [state, formAction, pending] = useActionState<ResetFormState, FormData>(
    resetPassword,
    {},
  );

  if (state.done) {
    return (
      <div className="space-y-4 text-center">
        <p className="bg-primary/10 text-foreground rounded-md px-3 py-3 text-sm">
          {t("resetDone")}
        </p>
        <Link
          href="/login"
          className="text-foreground text-sm font-medium hover:underline"
        >
          {t("signInLink")}
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="token" value={token} />

      {state.formError ? (
        <p
          role="alert"
          className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
        >
          {t(state.formError)}
        </p>
      ) : null}

      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          {t("newPassword")}
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={Boolean(state.errors?.password)}
        />
        {state.errors?.password ? (
          <p className="text-destructive text-xs">{t(state.errors.password)}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="confirmPassword" className="text-sm font-medium">
          {t("confirmPassword")}
        </label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={Boolean(state.errors?.confirmPassword)}
        />
        {state.errors?.confirmPassword ? (
          <p className="text-destructive text-xs">
            {t(state.errors.confirmPassword)}
          </p>
        ) : null}
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t("resetSaving") : t("resetButton")}
      </Button>
    </form>
  );
}
