"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  clearPointShelves,
  registerPointShelves,
} from "@/lib/actions/point-shelves";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

// Owner/manager control on the labels page: register the printed grid as the
// point's bays to turn on auto-placement (the receive scan then picks the
// least-busy bay itself), or clear the registry to turn it off.
export function ShelfRegistryToggle({
  rows,
  bays,
  registered,
}: {
  rows: number;
  bays: number;
  registered: number;
}) {
  const t = useTranslations("Point");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [count, setCount] = useState(registered);

  const run = (fn: () => Promise<{ ok?: boolean; count?: number }>) =>
    start(async () => {
      const res = await fn();
      if (res.ok) {
        setCount(res.count ?? 0);
        router.refresh();
      }
    });

  const on = count > 0;

  return (
    <div className="space-y-2 rounded-xl border p-3 print:hidden">
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <Sparkles className="size-4" /> {t("shelfAutoTitle")}
      </p>
      <p className="text-muted-foreground text-xs">
        {on ? t("shelfAutoOn", { count }) : t("shelfAutoOff")}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => run(() => registerPointShelves(rows, bays))}
          disabled={pending}
        >
          {on ? t("shelfAutoUpdate") : t("shelfAutoEnable")}
        </Button>
        {on ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => run(() => clearPointShelves())}
            disabled={pending}
          >
            {t("shelfAutoDisable")}
          </Button>
        ) : null}
      </div>
      <p className="text-muted-foreground text-xs">{t("shelfAutoHint")}</p>
    </div>
  );
}
