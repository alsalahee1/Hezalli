"use client";

import { useTransition } from "react";
import { ChevronDown, Store } from "lucide-react";
import { useTranslations } from "next-intl";

import { setActiveBranch } from "@/lib/actions/point";
import { useRouter } from "@/i18n/navigation";

// Header control for a multi-branch owner (docs §42j): pick which hub the point
// app is operating. Changing it writes the point_branch cookie via
// setActiveBranch and refreshes so every page re-resolves to the new branch.
export function PointBranchSwitcher({
  branches,
  currentId,
}: {
  branches: { id: string; name: string }[];
  currentId: string;
}) {
  const t = useTranslations("Point");
  const router = useRouter();
  const [pending, start] = useTransition();

  const onChange = (id: string) => {
    if (id === currentId) return;
    start(async () => {
      const res = await setActiveBranch(id);
      if (res.ok) router.refresh();
    });
  };

  return (
    <label
      className="text-muted-foreground hover:text-foreground relative inline-flex min-h-9 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium"
      title={t("branchSwitch")}
    >
      <Store className="size-3.5 shrink-0" />
      <select
        aria-label={t("branchSwitch")}
        value={currentId}
        disabled={pending}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-[8rem] cursor-pointer truncate bg-transparent pe-4 outline-none disabled:opacity-50"
      >
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute end-1.5 size-3.5" />
    </label>
  );
}
