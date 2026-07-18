"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { becomeSeller, type FormState } from "@/lib/actions/seller";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function BecomeSellerForm() {
  const t = useTranslations("Sell");
  const [state, action, pending] = useActionState<FormState, FormData>(
    becomeSeller,
    {},
  );

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.formError ? (
        <p
          role="alert"
          className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
        >
          {t(state.formError)}
        </p>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="storeName">{t("storeName")}</Label>
        <Input
          id="storeName"
          name="storeName"
          required
          aria-invalid={Boolean(state.errors?.storeName)}
        />
        {state.errors?.storeName ? (
          <p className="text-destructive text-xs">
            {t(state.errors.storeName)}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">{t("storeDescription")}</Label>
        <Textarea
          id="description"
          name="description"
          rows={3}
          placeholder={t("storeDescriptionHint")}
          aria-invalid={Boolean(state.errors?.description)}
        />
        {state.errors?.description ? (
          <p className="text-destructive text-xs">
            {t(state.errors.description)}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="phone">{t("phone")}</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          dir="ltr"
          placeholder="+967 7XX XXX XXX"
          aria-invalid={Boolean(state.errors?.phone)}
        />
        {state.errors?.phone ? (
          <p className="text-destructive text-xs">{t(state.errors.phone)}</p>
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
          <span>{t("acceptSellerTerms")}</span>
        </label>
        {state.errors?.acceptTerms ? (
          <p className="text-destructive text-xs">
            {t(state.errors.acceptTerms)}
          </p>
        ) : null}
      </div>

      <p className="text-muted-foreground text-xs">{t("kycNote")}</p>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t("opening") : t("openStore")}
      </Button>
    </form>
  );
}
