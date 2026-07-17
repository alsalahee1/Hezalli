"use client";

import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";

import type { FormState } from "@/lib/actions/category";
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
