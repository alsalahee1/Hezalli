"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

import { changePassword, type FormState } from "@/lib/actions/account";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";

export function PasswordForm() {
  const t = useTranslations("Account");
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<FormState, FormData>(
    changePassword,
    {},
  );

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      toast(t("passwordUpdated"));
    }
  }, [state, t, toast]);

  return (
    <form
      ref={formRef}
      action={action}
      className="max-w-sm space-y-4"
      noValidate
    >
      {state.formError ? (
        <p
          role="alert"
          className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
        >
          {t(state.formError)}
        </p>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="currentPassword">{t("currentPassword")}</Label>
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(state.errors?.currentPassword)}
        />
        {state.errors?.currentPassword ? (
          <p className="text-destructive text-xs">
            {t(state.errors.currentPassword)}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="newPassword">{t("newPassword")}</Label>
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={Boolean(state.errors?.newPassword)}
        />
        {state.errors?.newPassword ? (
          <p className="text-destructive text-xs">
            {t(state.errors.newPassword)}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirmPassword">{t("confirmPassword")}</Label>
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

      <Button type="submit" disabled={pending}>
        {pending ? t("updating") : t("updatePassword")}
      </Button>
    </form>
  );
}
