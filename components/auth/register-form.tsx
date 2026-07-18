"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { registerUser, type AuthFormState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function RegisterForm({ refCode }: { refCode?: string }) {
  const t = useTranslations("Auth");
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    registerUser,
    {},
  );

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {refCode ? <input type="hidden" name="ref" value={refCode} /> : null}
      {state.formError ? (
        <p
          role="alert"
          className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
        >
          {t(state.formError)}
        </p>
      ) : null}

      <div className="space-y-1.5">
        <label htmlFor="name" className="text-sm font-medium">
          {t("name")}
        </label>
        <Input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          required
          aria-invalid={Boolean(state.errors?.name)}
        />
        {state.errors?.name ? (
          <p className="text-destructive text-xs">{t(state.errors.name)}</p>
        ) : null}
      </div>

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

      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          {t("password")}
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

      <div className="space-y-1.5">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="acceptTerms"
            className="mt-0.5 size-4"
            aria-invalid={Boolean(state.errors?.acceptTerms)}
          />
          <span>
            {t.rich("acceptTerms", {
              terms: (chunks) => (
                <Link
                  href="/terms"
                  className="text-foreground underline underline-offset-2"
                >
                  {chunks}
                </Link>
              ),
              privacy: (chunks) => (
                <Link
                  href="/privacy"
                  className="text-foreground underline underline-offset-2"
                >
                  {chunks}
                </Link>
              ),
            })}
          </span>
        </label>
        {state.errors?.acceptTerms ? (
          <p className="text-destructive text-xs">
            {t(state.errors.acceptTerms)}
          </p>
        ) : null}
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t("creatingAccount") : t("registerButton")}
      </Button>
    </form>
  );
}
