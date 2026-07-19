"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";
import { LocateFixed, MapPin } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { saveAddress, type FormState } from "@/lib/actions/account";
import { GOVERNORATES, localizedGovernorate } from "@/lib/yemen";
import { nearestGovernorate } from "@/lib/yemen-geo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type AddressData = {
  id: string;
  fullName: string;
  phone: string;
  governorate: string;
  city: string;
  line1: string;
  line2: string | null;
  notes: string | null;
  lat: number | null;
  lng: number | null;
  isDefault: boolean;
};

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {error ? (
        <span className="text-destructive block text-xs">{error}</span>
      ) : null}
    </label>
  );
}

export function AddressForm({
  address,
  onDone,
}: {
  address?: AddressData;
  onDone: () => void;
}) {
  const t = useTranslations("Account");
  const locale = useLocale();
  const [state, action, pending] = useActionState<FormState, FormData>(
    saveAddress,
    {},
  );
  const err = (k?: string) => (k ? t(k) : undefined);

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    address?.lat != null && address?.lng != null
      ? { lat: address.lat, lng: address.lng }
      : null,
  );
  const [geoErr, setGeoErr] = useState(false);
  const [locating, setLocating] = useState(false);

  const pin = () => {
    setGeoErr(false);
    if (!navigator.geolocation) {
      setGeoErr(true);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setGeoErr(true);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);

  return (
    <form
      action={action}
      className="space-y-4 rounded-lg border p-4"
      noValidate
    >
      {address ? <input type="hidden" name="id" value={address.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("fullName")} error={err(state.errors?.fullName)}>
          <Input name="fullName" defaultValue={address?.fullName} required />
        </Field>
        <Field label={t("phone")} error={err(state.errors?.phone)}>
          <Input
            name="phone"
            type="tel"
            dir="ltr"
            defaultValue={address?.phone}
            placeholder="+967 7XX XXX XXX"
            required
          />
        </Field>
        <Field label={t("governorate")} error={err(state.errors?.governorate)}>
          <Select
            name="governorate"
            defaultValue={address?.governorate ?? ""}
            required
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
        </Field>
        <Field label={t("city")} error={err(state.errors?.city)}>
          <Input name="city" defaultValue={address?.city} required />
        </Field>
      </div>

      <Field label={t("line1")} error={err(state.errors?.line1)}>
        <Input name="line1" defaultValue={address?.line1} required />
      </Field>
      <Field label={t("line2")}>
        <Input name="line2" defaultValue={address?.line2 ?? ""} />
      </Field>
      <Field label={t("notes")}>
        <Textarea name="notes" defaultValue={address?.notes ?? ""} rows={2} />
      </Field>

      {/* Optional precise location for faster Hezalli Express routing. */}
      <input type="hidden" name="lat" value={coords?.lat ?? ""} />
      <input type="hidden" name="lng" value={coords?.lng ?? ""} />
      <div className="rounded-md border p-3">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm">
            <MapPin className="text-muted-foreground size-4" />
            {coords
              ? t("locationPinned", {
                  gov: localizedGovernorate(
                    nearestGovernorate(coords.lat, coords.lng),
                    locale,
                  ),
                })
              : t("locationHint")}
          </span>
          <div className="flex items-center gap-2">
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
        {geoErr ? (
          <p className="text-destructive mt-2 text-xs">{t("locationError")}</p>
        ) : null}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isDefault"
          defaultChecked={address?.isDefault}
          className="size-4"
        />
        {t("makeDefault")}
      </label>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? t("saving") : t("saveAddress")}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
