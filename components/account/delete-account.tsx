"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { deleteAccount, type FormState } from "@/lib/actions/account";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function DeleteAccount() {
  const t = useTranslations("Account");
  const [state, action, pending] = useActionState<FormState, FormData>(
    deleteAccount,
    {},
  );

  return (
    <form
      action={action}
      className="border-destructive/40 space-y-3 rounded-lg border p-4"
      noValidate
    >
      <p className="text-muted-foreground text-sm">{t("deleteWarning")}</p>
      <div className="space-y-1.5">
        <label htmlFor="confirm" className="text-sm font-medium">
          {t("typeToConfirm")}
        </label>
        <Input
          id="confirm"
          name="confirm"
          autoComplete="off"
          placeholder="DELETE"
          className="max-w-40"
          aria-invalid={Boolean(state.errors?.confirm)}
        />
        {state.errors?.confirm ? (
          <p className="text-destructive text-xs">{t(state.errors.confirm)}</p>
        ) : null}
      </div>
      <Button type="submit" variant="destructive" disabled={pending}>
        {pending ? t("deleting") : t("deleteButton")}
      </Button>
    </form>
  );
}
