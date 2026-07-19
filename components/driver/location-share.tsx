"use client";

import { useState, useTransition } from "react";
import { LocateFixed, MapPin } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { updateCourierLocation } from "@/lib/actions/courier";
import { localizedGovernorate } from "@/lib/yemen";
import { useRouter } from "@/i18n/navigation";

// Opt-in location sharing for "nearest" dispatch. Reads the device location on
// tap and stores it (mapped to a governorate) — no continuous tracking.
export function LocationShare({
  currentGovernorate,
}: {
  currentGovernorate: string | null;
}) {
  const t = useTranslations("Driver");
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [gov, setGov] = useState(currentGovernorate);
  const [err, setErr] = useState(false);

  const share = () => {
    setErr(false);
    if (!navigator.geolocation) {
      setErr(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        start(async () => {
          const res = await updateCourierLocation(
            pos.coords.latitude,
            pos.coords.longitude,
          );
          if (res.error) setErr(true);
          else {
            setGov(res.governorate ?? null);
            router.refresh();
          }
        }),
      () => setErr(true),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  return (
    <div className="rounded-xl border p-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <MapPin className="text-muted-foreground size-4" />
          {gov
            ? t("locationOn", { gov: localizedGovernorate(gov, locale) })
            : t("locationOff")}
        </span>
        <button
          onClick={share}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-medium disabled:opacity-50"
        >
          <LocateFixed className="size-4" />
          {pending
            ? t("saving")
            : gov
              ? t("updateLocation")
              : t("shareLocation")}
        </button>
      </div>
      {err ? (
        <p className="text-destructive mt-2 text-xs">{t("locationError")}</p>
      ) : null}
    </div>
  );
}
