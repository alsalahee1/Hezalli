"use client";

import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";

import { updateProfile, type FormState } from "@/lib/actions/account";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";

export function ProfileForm({
  defaultName,
  email,
  defaultPhone,
}: {
  defaultName: string;
  email: string;
  defaultPhone: string;
}) {
  const t = useTranslations("Account");
  const { toast } = useToast();
  const [state, action, pending] = useActionState<FormState, FormData>(
    updateProfile,
    {},
  );

  useEffect(() => {
    if (state.ok) toast(t("saved"));
  }, [state, t, toast]);

  return (
    <form action={action} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="name">{t("name")}</Label>
        <Input
          id="name"
          name="name"
          defaultValue={defaultName}
          required
          aria-invalid={Boolean(state.errors?.name)}
        />
        {state.errors?.name ? (
          <p className="text-destructive text-xs">{t(state.errors.name)}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">{t("email")}</Label>
        <Input id="email" type="email" defaultValue={email} disabled />
        <p className="text-muted-foreground text-xs">{t("emailReadonly")}</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="phone">{t("phone")}</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          dir="ltr"
          defaultValue={defaultPhone}
          placeholder="+967 7XX XXX XXX"
          aria-invalid={Boolean(state.errors?.phone)}
        />
        {state.errors?.phone ? (
          <p className="text-destructive text-xs">{t(state.errors.phone)}</p>
        ) : null}
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? t("saving") : t("save")}
      </Button>
    </form>
  );
}
