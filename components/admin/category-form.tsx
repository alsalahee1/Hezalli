"use client";

import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";

import type { FormState } from "@/lib/actions/category";
import { SIZE_CLASSES } from "@/lib/validations/product";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

export type CategoryFormData = {
  id: string;
  nameEn: string;
  nameAr: string;
  slug: string;
  icon: string | null;
  position: number;
  isActive: boolean;
  parentId: string | null;
  // Delivery defaults for courier capacity (lib/courier-capacity.ts).
  defaultSizeClass: string | null;
  defaultWeightGrams: number | null;
  defaultDimensionsCm: { l: number; w: number; h: number } | null;
};

export function CategoryForm({
  action,
  category,
  parents,
  onDone,
}: {
  action: (prev: FormState | undefined, fd: FormData) => Promise<FormState>;
  category?: CategoryFormData;
  parents: { id: string; label: string }[];
  onDone: () => void;
}) {
  const t = useTranslations("AdminCategories");
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    {},
  );
  const err = (k: string) => state.errors?.[k];

  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);

  return (
    <form
      action={formAction}
      className="bg-muted/30 space-y-4 rounded-lg border p-4"
      noValidate
    >
      {category ? <input type="hidden" name="id" value={category.id} /> : null}
      {state.formError ? (
        <p role="alert" className="text-destructive text-sm">
          {t(state.formError)}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="nameEn">{t("nameEn")}</Label>
          <Input
            id="nameEn"
            name="nameEn"
            defaultValue={category?.nameEn}
            required
            aria-invalid={Boolean(err("nameEn"))}
          />
          {err("nameEn") ? (
            <p className="text-destructive text-xs">{t(err("nameEn")!)}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nameAr">{t("nameAr")}</Label>
          <Input
            id="nameAr"
            name="nameAr"
            dir="rtl"
            defaultValue={category?.nameAr}
            required
            aria-invalid={Boolean(err("nameAr"))}
          />
          {err("nameAr") ? (
            <p className="text-destructive text-xs">{t(err("nameAr")!)}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="slug">{t("slug")}</Label>
          <Input
            id="slug"
            name="slug"
            dir="ltr"
            className="font-mono"
            defaultValue={category?.slug}
            required
            aria-invalid={Boolean(err("slug"))}
          />
          {err("slug") ? (
            <p className="text-destructive text-xs">{t(err("slug")!)}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="parentId">{t("parent")}</Label>
          <Select
            id="parentId"
            name="parentId"
            defaultValue={category?.parentId ?? ""}
            aria-invalid={Boolean(err("parentId"))}
          >
            <option value="">{t("noParent")}</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
          {err("parentId") ? (
            <p className="text-destructive text-xs">{t(err("parentId")!)}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="icon">{t("icon")}</Label>
          <Input
            id="icon"
            name="icon"
            defaultValue={category?.icon ?? ""}
            placeholder="📱"
            className="w-24"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="position">{t("position")}</Label>
          <Input
            id="position"
            name="position"
            type="number"
            min={0}
            defaultValue={category?.position ?? 0}
            className="w-28"
            aria-invalid={Boolean(err("position"))}
          />
          {err("position") ? (
            <p className="text-destructive text-xs">{t(err("position")!)}</p>
          ) : null}
        </div>
      </div>

      {/* Delivery defaults: typical weight/size for products in this
          category, used for courier capacity when a product has none. */}
      <div className="space-y-1.5">
        <Label htmlFor="defaultSizeClass">{t("shippingDefaults")}</Label>
        <div className="flex flex-wrap items-center gap-2" dir="ltr">
          <Select
            id="defaultSizeClass"
            name="defaultSizeClass"
            defaultValue={category?.defaultSizeClass ?? ""}
            className="w-44"
          >
            <option value="">{t("sizeClassNone")}</option>
            {SIZE_CLASSES.map((c) => (
              <option key={c} value={c}>
                {t(`size_${c}`)}
              </option>
            ))}
          </Select>
          <Input
            id="defaultWeightGrams"
            name="defaultWeightGrams"
            type="number"
            min={0}
            placeholder={t("defaultWeight")}
            className="w-36"
            defaultValue={category?.defaultWeightGrams ?? ""}
            aria-invalid={Boolean(err("defaultWeightGrams"))}
          />
          {(["dimL", "dimW", "dimH"] as const).map((k, i) => (
            <Input
              key={k}
              id={k}
              name={k}
              type="number"
              min={1}
              max={1000}
              placeholder={t(k)}
              className="w-24"
              aria-invalid={Boolean(err("defaultDimensionsCm"))}
              defaultValue={
                category?.defaultDimensionsCm
                  ? [
                      category.defaultDimensionsCm.l,
                      category.defaultDimensionsCm.w,
                      category.defaultDimensionsCm.h,
                    ][i]
                  : ""
              }
            />
          ))}
        </div>
        {err("defaultWeightGrams") || err("defaultDimensionsCm") ? (
          <p className="text-destructive text-xs">
            {t(err("defaultWeightGrams") ?? err("defaultDimensionsCm")!)}
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">
            {t("shippingDefaultsHint")}
          </p>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={category ? category.isActive : true}
          className="size-4"
        />
        {t("active")}
      </label>

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? t("saving") : t("save")}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDone}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
