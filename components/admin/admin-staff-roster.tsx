"use client";

import { useState, useTransition } from "react";
import { Crown, Pause, Play } from "lucide-react";
import { useTranslations } from "next-intl";

import { adminSetPointStaffActive } from "@/lib/actions/point-staff";
import { useRouter } from "@/i18n/navigation";

type StaffRow = {
  id: string;
  name: string | null;
  contact: string | null;
  role: "MANAGER" | "CASHIER" | "COLLECTOR" | "ORGANIZER";
  isActive: boolean;
  since: string;
};

// Ops read-only view of a hub's team, with a single lever: pause / reinstate a
// member's access (fraud response). Role changes, hiring, and removal stay the
// owner's job — ops only holds the access switch (lib/actions/point-staff.ts
// adminSetPointStaffActive, delivery-manager gated).
export function AdminStaffRoster({
  pointId,
  owner,
  staff,
}: {
  pointId: string;
  owner: { name: string | null; email: string | null };
  staff: StaffRow[];
}) {
  const t = useTranslations("AdminPoints");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string, active: boolean) =>
    start(async () => {
      setError(null);
      const res = await adminSetPointStaffActive(pointId, id, active);
      if (res.error) setError(res.error);
      else router.refresh();
    });

  return (
    <div className="space-y-2">
      {error ? (
        <p className="text-destructive text-sm">{t("staffErr")}</p>
      ) : null}
      <ul className="divide-y rounded-lg border">
        <li className="flex items-center gap-3 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <Crown className="size-4 text-amber-500" />
              {owner.name ?? owner.email ?? t("staffOwner")}
            </p>
          </div>
          <span className="bg-muted text-muted-foreground rounded-full px-2.5 py-0.5 text-xs font-medium">
            {t("staffOwner")}
          </span>
        </li>
        {staff.map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {s.name ?? s.contact ?? "—"}
                <span className="text-muted-foreground text-xs">
                  {" · "}
                  {t(`staffRole_${s.role}`)}
                </span>
              </p>
              <p className="text-muted-foreground truncate text-xs">
                {s.contact ? <span dir="ltr">{s.contact}</span> : null}
                {s.contact ? " · " : ""}
                {t("staffSince", { date: s.since })}
              </p>
            </div>
            <span
              className={
                s.isActive
                  ? "rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground rounded-full px-2.5 py-0.5 text-xs font-medium"
              }
            >
              {s.isActive ? t("staffActive") : t("staffPaused")}
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={() => toggle(s.id, !s.isActive)}
              className="text-muted-foreground hover:text-foreground inline-flex min-h-10 shrink-0 items-center gap-1 rounded-full border px-3 py-2 text-xs font-medium disabled:opacity-50"
            >
              {s.isActive ? (
                <>
                  <Pause className="size-3.5" /> {t("staffDeactivate")}
                </>
              ) : (
                <>
                  <Play className="size-3.5" /> {t("staffReactivate")}
                </>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
