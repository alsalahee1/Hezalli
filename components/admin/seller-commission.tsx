"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { setSellerCommission } from "@/lib/actions/admin-oversight";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// `override` and `platformPercent` are human percentages (e.g. 8, not 0.08).
export function SellerCommission({
  sellerId,
  override,
  platformPercent,
}: {
  sellerId: string;
  override: number | null;
  platformPercent: number;
}) {
  const t = useTranslations("AdminSellers");
  const router = useRouter();
  const [val, setVal] = useState(override != null ? String(override) : "");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const run = (rate: number | null) =>
    start(async () => {
      setErr(null);
      const res = await setSellerCommission(sellerId, rate);
      if (res.error) setErr(res.error);
      else router.refresh();
    });

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Input
          type="number"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder={String(platformPercent)}
          className="w-28"
          dir="ltr"
        />
        <span className="text-muted-foreground text-sm">%</span>
        <Button
          size="sm"
          disabled={pending || val.trim() === ""}
          onClick={() => run(Number(val))}
        >
          {t("save")}
        </Button>
        {override != null ? (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => {
              setVal("");
              run(null);
            }}
          >
            {t("clearOverride")}
          </Button>
        ) : null}
      </div>
      <p className="text-muted-foreground text-xs">
        {override != null
          ? t("overrideActive", { rate: override })
          : t("usingPlatform", { rate: platformPercent })}
      </p>
      {err ? (
        <p className="text-destructive text-xs">{t(`err_${err}`)}</p>
      ) : null}
    </div>
  );
}
