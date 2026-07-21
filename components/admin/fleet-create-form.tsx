"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { createFleet } from "@/lib/actions/fleet";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Admin creates a new fleet-partner (name + optional contact), then jumps to
// its detail page to add couriers.
export function FleetCreateForm() {
  const t = useTranslations("AdminFleets");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setErr(null);
    start(async () => {
      const res = await createFleet({
        name: String(form.get("name") ?? ""),
        contactPhone: String(form.get("contactPhone") ?? ""),
        contactEmail: String(form.get("contactEmail") ?? ""),
      });
      if (res.error) setErr(res.error);
      else if (res.fleetId) router.push(`/admin/fleets/${res.fleetId}`);
    });
  };

  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
    >
      <div className="space-y-1.5">
        <Label htmlFor="name">{t("name")}</Label>
        <Input
          id="name"
          name="name"
          required
          placeholder={t("namePlaceholder")}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="contactPhone">{t("phone")}</Label>
        <Input id="contactPhone" name="contactPhone" dir="ltr" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="contactEmail">{t("email")}</Label>
        <Input id="contactEmail" name="contactEmail" type="email" dir="ltr" />
      </div>
      <div className="flex items-end">
        <Button type="submit" disabled={pending}>
          {pending ? t("creating") : t("create")}
        </Button>
      </div>
      {err ? (
        <p className="text-destructive text-sm sm:col-span-4">
          {t(`err_${err}`)}
        </p>
      ) : null}
    </form>
  );
}
