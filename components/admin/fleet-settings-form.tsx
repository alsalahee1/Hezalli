"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { updateFleet } from "@/lib/actions/fleet";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Admin edits a fleet's profile + active state.
export function FleetSettingsForm({
  fleetId,
  name,
  contactPhone,
  contactEmail,
  isActive,
}: {
  fleetId: string;
  name: string;
  contactPhone: string | null;
  contactEmail: string | null;
  isActive: boolean;
}) {
  const t = useTranslations("AdminFleets");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [active, setActive] = useState(isActive);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setErr(null);
    setOk(false);
    start(async () => {
      const res = await updateFleet({
        fleetId,
        name: String(form.get("name") ?? ""),
        contactPhone: String(form.get("contactPhone") ?? ""),
        contactEmail: String(form.get("contactEmail") ?? ""),
        isActive: active,
      });
      if (res.error) setErr(res.error);
      else {
        setOk(true);
        router.refresh();
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="f-name">{t("name")}</Label>
          <Input id="f-name" name="name" defaultValue={name} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-phone">{t("phone")}</Label>
          <Input
            id="f-phone"
            name="contactPhone"
            dir="ltr"
            defaultValue={contactPhone ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-email">{t("email")}</Label>
          <Input
            id="f-email"
            name="contactEmail"
            type="email"
            dir="ltr"
            defaultValue={contactEmail ?? ""}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
        />
        {t("activeLabel")}
      </label>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? t("saving") : t("save")}
        </Button>
        {ok ? (
          <span className="text-sm text-emerald-600">{t("saved")}</span>
        ) : null}
        {err ? (
          <span className="text-destructive text-sm">{t(`err_${err}`)}</span>
        ) : null}
      </div>
    </form>
  );
}
