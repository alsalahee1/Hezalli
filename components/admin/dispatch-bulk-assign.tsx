"use client";

import { useState, useTransition } from "react";
import { Users } from "lucide-react";
import { useTranslations } from "next-intl";

import { assignManyCouriers } from "@/lib/actions/courier";
import { useRouter } from "@/i18n/navigation";
import type { CourierOpt } from "@/components/admin/dispatch-assign";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

// Bulk-assign every currently-unassigned parcel in a chosen governorate to one
// driver — for when a courier takes a whole area. Groups are unassigned-only.
export function DispatchBulkAssign({
  groups,
  couriers,
}: {
  groups: { governorate: string; ids: string[] }[];
  couriers: CourierOpt[];
}) {
  const t = useTranslations("Dispatch");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [gov, setGov] = useState(groups[0]?.governorate ?? "");
  const [driver, setDriver] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  if (groups.length === 0 || couriers.length === 0) return null;

  const group = groups.find((g) => g.governorate === gov);

  const run = () => {
    if (!group || !driver) return;
    setMsg(null);
    start(async () => {
      const res = await assignManyCouriers(group.ids, driver);
      if (res.error) setMsg(t("assignError"));
      else {
        setMsg(t("bulkAssigned", { count: res.count ?? 0 }));
        setDriver("");
        router.refresh();
      }
    });
  };

  return (
    <div className="bg-muted/30 flex flex-wrap items-end gap-2 rounded-lg border p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Users className="text-muted-foreground size-4" />
        {t("bulkTitle")}
      </div>
      <Select
        value={gov}
        onChange={(e) => setGov(e.target.value)}
        disabled={pending}
        className="w-auto"
        aria-label={t("bulkGovernorate")}
      >
        {groups.map((g) => (
          <option key={g.governorate} value={g.governorate}>
            {g.governorate} ({g.ids.length})
          </option>
        ))}
      </Select>
      <Select
        value={driver}
        onChange={(e) => setDriver(e.target.value)}
        disabled={pending}
        className="w-auto"
        aria-label={t("assignTo")}
      >
        <option value="">{t("bulkPickDriver")}</option>
        {couriers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      <Button type="button" onClick={run} disabled={pending || !driver || !group}>
        {pending ? t("saving") : t("bulkAssign")}
      </Button>
      {msg ? (
        <span className="text-muted-foreground text-xs">{msg}</span>
      ) : null}
    </div>
  );
}
