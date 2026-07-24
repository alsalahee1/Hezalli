"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  deleteCoupon,
  saveCoupon,
  setCouponActive,
  type CouponInput,
} from "@/lib/actions/coupon";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-dialog";

export type VoucherRow = {
  id: string;
  code: string;
  discountType: string;
  value: number;
  maxDiscountUsd: number | null;
  minSpendUsd: number | null;
  maxUses: number | null;
  usedCount: number;
  perUserLimit: number | null;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
};

type Draft = Omit<CouponInput, "scope"> & { usedCount?: number };

const empty: Draft = {
  code: "",
  discountType: "PERCENT",
  value: 10,
  maxDiscountUsd: null,
  minSpendUsd: null,
  maxUses: null,
  perUserLimit: null,
  startsAt: null,
  endsAt: null,
  isActive: true,
};

export function VoucherManager({
  rows,
  variant,
}: {
  rows: VoucherRow[];
  variant: "admin" | "seller";
}) {
  const t = useTranslations("Vouchers");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));

  const openEdit = (r: VoucherRow) => {
    setErr(null);
    setDraft({
      id: r.id,
      code: r.code,
      discountType: r.discountType as Draft["discountType"],
      value: r.value,
      maxDiscountUsd: r.maxDiscountUsd,
      minSpendUsd: r.minSpendUsd,
      maxUses: r.maxUses,
      perUserLimit: r.perUserLimit,
      startsAt: r.startsAt ? r.startsAt.slice(0, 10) : null,
      endsAt: r.endsAt ? r.endsAt.slice(0, 10) : null,
      isActive: r.isActive,
    });
  };

  const save = () =>
    start(async () => {
      if (!draft) return;
      setErr(null);
      const res = await saveCoupon({ ...draft, scope: "PLATFORM" });
      if (res.error) {
        setErr(res.error);
        return;
      }
      setDraft(null);
      router.refresh();
    });

  const remove = async (id: string, code: string) => {
    if (
      !(await confirm(t("deleteConfirm", { code }), {
        title: t("deleteTitle"),
        destructive: true,
        confirmLabel: t("deleteButton"),
      }))
    )
      return;
    start(async () => {
      await deleteCoupon(id);
      router.refresh();
    });
  };

  const toggle = (id: string, active: boolean) =>
    start(async () => {
      await setCouponActive(id, active);
      router.refresh();
    });

  const numOrNull = (v: string): number | null =>
    v.trim() === "" ? null : Number(v);

  const summary = (r: VoucherRow) =>
    r.discountType === "FREE_SHIPPING"
      ? t("freeShipping")
      : r.discountType === "PERCENT"
        ? `${r.value}%${r.maxDiscountUsd ? ` (≤$${r.maxDiscountUsd})` : ""}`
        : `$${r.value}`;

  return (
    <div className="space-y-4">
      {dialog}
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={() => {
            setErr(null);
            setDraft({ ...empty });
          }}
          disabled={pending}
        >
          <Plus className="size-4" /> {t("addVoucher")}
        </Button>
      </div>

      {draft ? (
        <div className="space-y-3 rounded-lg border p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-medium">
              {t("code")}
              <Input
                value={draft.code}
                onChange={(e) => set("code", e.target.value.toUpperCase())}
                placeholder="SAVE10"
                className="uppercase"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium">
              {t("type")}
              <Select
                value={draft.discountType}
                onChange={(e) =>
                  set("discountType", e.target.value as Draft["discountType"])
                }
              >
                <option value="PERCENT">{t("type_PERCENT")}</option>
                <option value="FIXED">{t("type_FIXED")}</option>
                <option value="FREE_SHIPPING">{t("type_FREE_SHIPPING")}</option>
              </Select>
            </label>
            {draft.discountType !== "FREE_SHIPPING" ? (
              <label className="flex flex-col gap-1 text-xs font-medium">
                {draft.discountType === "PERCENT"
                  ? t("percentVal")
                  : t("fixedVal")}
                <Input
                  type="number"
                  min={0}
                  value={draft.value}
                  onChange={(e) => set("value", Number(e.target.value))}
                  dir="ltr"
                />
              </label>
            ) : null}
            {draft.discountType === "PERCENT" ? (
              <label className="flex flex-col gap-1 text-xs font-medium">
                {t("maxDiscount")}
                <Input
                  type="number"
                  min={0}
                  value={draft.maxDiscountUsd ?? ""}
                  onChange={(e) =>
                    set("maxDiscountUsd", numOrNull(e.target.value))
                  }
                  placeholder={t("optional")}
                  dir="ltr"
                />
              </label>
            ) : null}
            <label className="flex flex-col gap-1 text-xs font-medium">
              {t("minSpend")}
              <Input
                type="number"
                min={0}
                value={draft.minSpendUsd ?? ""}
                onChange={(e) => set("minSpendUsd", numOrNull(e.target.value))}
                placeholder={t("optional")}
                dir="ltr"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium">
              {t("maxUses")}
              <Input
                type="number"
                min={0}
                value={draft.maxUses ?? ""}
                onChange={(e) => set("maxUses", numOrNull(e.target.value))}
                placeholder={t("optional")}
                dir="ltr"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium">
              {t("perUser")}
              <Input
                type="number"
                min={0}
                value={draft.perUserLimit ?? ""}
                onChange={(e) => set("perUserLimit", numOrNull(e.target.value))}
                placeholder={t("optional")}
                dir="ltr"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium">
              {t("startsAt")}
              <Input
                type="date"
                value={draft.startsAt ?? ""}
                onChange={(e) => set("startsAt", e.target.value || null)}
                dir="ltr"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium">
              {t("endsAt")}
              <Input
                type="date"
                value={draft.endsAt ?? ""}
                onChange={(e) => set("endsAt", e.target.value || null)}
                dir="ltr"
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={draft.isActive}
              onChange={(e) => set("isActive", e.target.checked)}
            />
            {t("active")}
          </label>
          {err ? (
            <p className="text-destructive text-sm">{t(`err_${err}`)}</p>
          ) : null}
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={pending}>
              {t("save")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDraft(null)}
              disabled={pending}
            >
              {t("cancel")}
            </Button>
          </div>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed py-14 text-center text-sm">
          {t("empty")}
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className={cn(
                "flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4",
                !r.isActive && "opacity-60",
              )}
            >
              <div className="min-w-0">
                <p className="font-mono font-semibold">{r.code}</p>
                <p className="text-muted-foreground text-sm">
                  {summary(r)}
                  {r.minSpendUsd ? ` · ${t("min")} $${r.minSpendUsd}` : ""}
                  {` · ${r.usedCount}${r.maxUses ? `/${r.maxUses}` : ""} ${t("used")}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={r.isActive}
                  onClick={() => toggle(r.id, !r.isActive)}
                  className="flex size-11 shrink-0 items-center justify-center"
                >
                  <span
                    className={`relative h-6 w-11 rounded-full transition-colors ${
                      r.isActive ? "bg-primary" : "bg-muted-foreground/30"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 size-5 rounded-full bg-white transition-all ${
                        r.isActive ? "start-[22px]" : "start-0.5"
                      }`}
                    />
                  </span>
                </button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openEdit(r)}
                  disabled={pending}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive"
                  onClick={() => remove(r.id, r.code)}
                  disabled={pending}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-muted-foreground text-xs">
        {variant === "seller" ? t("sellerNote") : t("adminNote")}
      </p>
    </div>
  );
}
