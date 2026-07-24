"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import {
  applyAsMerchant,
  type MerchantFormState,
} from "@/lib/actions/merchant-application";
import { GOVERNORATES } from "@/lib/yemen";
import { MERCHANT_CATEGORIES } from "@/lib/validations/merchant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

// Prefilled from the signed-in user's account so the applicant doesn't retype
// what Hezalli already knows. Mirrors BecomePointForm, minus the map picker.
export function BecomeMerchantForm({
  defaultFullName = "",
  defaultPhone = "",
}: {
  defaultFullName?: string;
  defaultPhone?: string;
}) {
  const t = useTranslations("MerchantApply");
  const locale = useLocale();
  const [state, action, pending] = useActionState<MerchantFormState, FormData>(
    applyAsMerchant,
    {},
  );

  if (state.ok) {
    return (
      <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-6 text-center">
        <CheckCircle2 className="mx-auto mb-3 size-8 text-emerald-600" />
        <h2 className="font-semibold">{t("submittedTitle")}</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {t("submittedBody")}
        </p>
      </div>
    );
  }

  const fieldError = (name: string) =>
    state.errors?.[name] ? (
      <p className="text-destructive text-xs">{t(state.errors[name])}</p>
    ) : null;

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
        <Label htmlFor="businessName">{t("businessName")}</Label>
        <Input
          id="businessName"
          name="businessName"
          required
          placeholder={t("businessNamePh")}
          aria-invalid={Boolean(state.errors?.businessName)}
        />
        {fieldError("businessName")}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="fullName">{t("fullName")}</Label>
          <Input
            id="fullName"
            name="fullName"
            required
            defaultValue={defaultFullName}
            aria-invalid={Boolean(state.errors?.fullName)}
          />
          {fieldError("fullName")}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">{t("phone")}</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            dir="ltr"
            required
            defaultValue={defaultPhone}
            placeholder="+967 7XX XXX XXX"
            aria-invalid={Boolean(state.errors?.phone)}
          />
          {fieldError("phone")}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="category">{t("category")}</Label>
        <Select
          id="category"
          name="category"
          required
          defaultValue=""
          aria-invalid={Boolean(state.errors?.category)}
        >
          <option value="" disabled>
            {t("selectCategory")}
          </option>
          {MERCHANT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`cat_${c}`)}
            </option>
          ))}
        </Select>
        {fieldError("category")}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="governorate">{t("governorate")}</Label>
          <Select
            id="governorate"
            name="governorate"
            required
            defaultValue=""
            aria-invalid={Boolean(state.errors?.governorate)}
          >
            <option value="" disabled>
              {t("selectGovernorate")}
            </option>
            {GOVERNORATES.map((g) => (
              <option key={g.value} value={g.value}>
                {locale === "ar" ? g.ar : g.en}
              </option>
            ))}
          </Select>
          {fieldError("governorate")}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="city">{t("city")}</Label>
          <Input
            id="city"
            name="city"
            required
            aria-invalid={Boolean(state.errors?.city)}
          />
          {fieldError("city")}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">{t("notes")}</Label>
        <Textarea id="notes" name="notes" rows={3} placeholder={t("notesPh")} />
        {fieldError("notes")}
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="acceptTerms" className="mt-0.5 size-4" />
        <span>{t("acceptTerms")}</span>
      </label>
      {fieldError("acceptTerms")}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
