"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  applyAsCourier,
  type CourierFormState,
} from "@/lib/actions/courier-application";
import { VEHICLE_TYPES } from "@/lib/validations/courier";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function BecomeCourierForm() {
  const t = useTranslations("Drive");
  const [state, action, pending] = useActionState<CourierFormState, FormData>(
    applyAsCourier,
    {},
  );

  // Success: the request is in — show a confirmation instead of the form.
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
        <Label htmlFor="fullName">{t("fullName")}</Label>
        <Input
          id="fullName"
          name="fullName"
          required
          aria-invalid={Boolean(state.errors?.fullName)}
        />
        {state.errors?.fullName ? (
          <p className="text-destructive text-xs">{t(state.errors.fullName)}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="phone">{t("phone")}</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          dir="ltr"
          required
          placeholder="+967 7XX XXX XXX"
          aria-invalid={Boolean(state.errors?.phone)}
        />
        {state.errors?.phone ? (
          <p className="text-destructive text-xs">{t(state.errors.phone)}</p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="governorate">{t("governorate")}</Label>
          <Input
            id="governorate"
            name="governorate"
            required
            aria-invalid={Boolean(state.errors?.governorate)}
          />
          {state.errors?.governorate ? (
            <p className="text-destructive text-xs">
              {t(state.errors.governorate)}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="city">{t("city")}</Label>
          <Input
            id="city"
            name="city"
            required
            aria-invalid={Boolean(state.errors?.city)}
          />
          {state.errors?.city ? (
            <p className="text-destructive text-xs">{t(state.errors.city)}</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="vehicleType">{t("vehicle")}</Label>
        <Select
          id="vehicleType"
          name="vehicleType"
          defaultValue=""
          required
          aria-invalid={Boolean(state.errors?.vehicleType)}
        >
          <option value="" disabled>
            {t("vehiclePlaceholder")}
          </option>
          {VEHICLE_TYPES.map((v) => (
            <option key={v} value={v}>
              {t(`vehicle_${v}`)}
            </option>
          ))}
        </Select>
        {state.errors?.vehicleType ? (
          <p className="text-destructive text-xs">
            {t(state.errors.vehicleType)}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">{t("notes")}</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={3}
          placeholder={t("notesHint")}
          aria-invalid={Boolean(state.errors?.notes)}
        />
        {state.errors?.notes ? (
          <p className="text-destructive text-xs">{t(state.errors.notes)}</p>
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
          <span>{t("acceptCourierTerms")}</span>
        </label>
        {state.errors?.acceptTerms ? (
          <p className="text-destructive text-xs">
            {t(state.errors.acceptTerms)}
          </p>
        ) : null}
      </div>

      <p className="text-muted-foreground text-xs">{t("reviewNote")}</p>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
