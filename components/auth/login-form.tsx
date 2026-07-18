"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { authenticate, type AuthFormState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm({ callbackUrl }: { callbackUrl?: string }) {
  const t = useTranslations("Auth");
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    authenticate,
    {},
  );

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {callbackUrl ? (
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
      ) : null}

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

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="text-sm font-medium">
            {t("password")}
          </label>
          <Link
            href="/forgot-password"
            className="text-muted-foreground hover:text-foreground text-xs hover:underline"
          >
            {t("forgotPassword")}
          </Link>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(state.errors?.password)}
        />
        {state.errors?.password ? (
          <p className="text-destructive text-xs">{t(state.errors.password)}</p>
        ) : null}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="remember"
          defaultChecked
          className="size-4"
        />
        {t("rememberMe")}
      </label>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t("signingIn") : t("signInButton")}
      </Button>
    </form>
  );
}
