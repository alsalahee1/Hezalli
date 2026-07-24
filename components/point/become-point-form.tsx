"use client";

import { useActionState, useState } from "react";
import {
  CheckCircle2,
  LocateFixed,
  Map as MapIcon,
  MapPin,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import {
  applyAsDeliveryPoint,
  type PointFormState,
} from "@/lib/actions/point-application";
import { GOVERNORATES, localizedGovernorate } from "@/lib/yemen";
import { nearestGovernorate } from "@/lib/yemen-geo";
import { MapPicker } from "@/components/map/map-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

// Prefilled from the signed-in user's account so the applicant doesn't retype
// what Hezalli already knows.
export function BecomePointForm({
  defaultFullName = "",
  defaultPhone = "",
}: {
  defaultFullName?: string;
  defaultPhone?: string;
}) {
  const t = useTranslations("PointApply");
  const locale = useLocale();
  const [state, action, pending] = useActionState<PointFormState, FormData>(
    applyAsDeliveryPoint,
    {},
  );

  // Governorate is controlled so pinning a location can fill it in.
  const [governorate, setGovernorate] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [geoErr, setGeoErr] = useState(false);
  const [locating, setLocating] = useState(false);
  const [showMap, setShowMap] = useState(false);

  // Setting coords also derives the governorate from the nearest centroid, so
  // dropping a pin fills that field too — one tap instead of a dropdown hunt.
  const setLocation = (lat: number, lng: number) => {
    setCoords({ lat, lng });
    setGovernorate(nearestGovernorate(lat, lng));
  };

  const pin = () => {
    setGeoErr(false);
    if (!navigator.geolocation) {
      setGeoErr(true);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation(pos.coords.latitude, pos.coords.longitude);
        setLocating(false);
      },
      () => {
        setGeoErr(true);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

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
        <Label htmlFor="pointName">{t("pointName")}</Label>
        <Input
          id="pointName"
          name="pointName"
          required
          placeholder={t("pointNamePh")}
          aria-invalid={Boolean(state.errors?.pointName)}
        />
        {fieldError("pointName")}
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

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="governorate">{t("governorate")}</Label>
          <Select
            id="governorate"
            name="governorate"
            required
            value={governorate}
            onChange={(e) => setGovernorate(e.target.value)}
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
        <Label htmlFor="addressLine">{t("addressLine")}</Label>
        <Input
          id="addressLine"
          name="addressLine"
          required
          placeholder={t("addressPh")}
          aria-invalid={Boolean(state.errors?.addressLine)}
        />
        {fieldError("addressLine")}
      </div>

      {/* Precise location: drop a GPS/map pin so the hub lands on the map and
          its governorate is filled without typing. */}
      <input type="hidden" name="lat" value={coords?.lat ?? ""} />
      <input type="hidden" name="lng" value={coords?.lng ?? ""} />
      <div className="rounded-md border p-3">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm">
            <MapPin className="text-muted-foreground size-4" />
            {coords
              ? t("locationPinned", {
                  gov: localizedGovernorate(governorate, locale),
                })
              : t("locationHint")}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {coords ? (
              <button
                type="button"
                onClick={() => setCoords(null)}
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                {t("clearLocation")}
              </button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowMap((v) => !v)}
            >
              <MapIcon className="size-4" />
              {showMap ? t("hideMap") : t("showMap")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={pin}
              disabled={locating}
            >
              <LocateFixed className="size-4" />
              {locating
                ? t("locating")
                : coords
                  ? t("repin")
                  : t("pinLocation")}
            </Button>
          </div>
        </div>
        {showMap ? (
          <>
            <MapPicker value={coords} onChange={setLocation} />
            <p className="text-muted-foreground mt-1.5 text-xs">
              {t("mapHint")}
            </p>
          </>
        ) : null}
        {geoErr ? (
          <p className="text-destructive mt-2 text-xs">{t("locationError")}</p>
        ) : null}
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
