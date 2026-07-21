"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { deleteBrand, saveBrand, type FormState } from "@/lib/actions/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConfirm } from "@/components/ui/confirm-dialog";

export type AdminBrand = {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  productCount: number;
};

function BrandForm({
  brand,
  onDone,
}: {
  brand?: AdminBrand;
  onDone: () => void;
}) {
  const t = useTranslations("AdminBrands");
  const [state, action, pending] = useActionState<FormState, FormData>(
    saveBrand,
    {},
  );
  const err = (k: string) => state.errors?.[k];

  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);

  return (
    <form
      action={action}
      className="bg-muted/30 space-y-4 rounded-lg border p-4"
      noValidate
    >
      {brand ? <input type="hidden" name="id" value={brand.id} /> : null}
      {state.formError ? (
        <p role="alert" className="text-destructive text-sm">
          {t(state.formError)}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="name">{t("name")}</Label>
          <Input
            id="name"
            name="name"
            defaultValue={brand?.name}
            required
            aria-invalid={Boolean(err("name"))}
          />
          {err("name") ? (
            <p className="text-destructive text-xs">{t(err("name")!)}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="slug">{t("slug")}</Label>
          <Input
            id="slug"
            name="slug"
            dir="ltr"
            className="font-mono"
            defaultValue={brand?.slug}
            required
            aria-invalid={Boolean(err("slug"))}
          />
          {err("slug") ? (
            <p className="text-destructive text-xs">{t(err("slug")!)}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="logo">{t("logo")}</Label>
          <Input
            id="logo"
            name="logo"
            dir="ltr"
            placeholder="https://…"
            defaultValue={brand?.logo ?? ""}
            aria-invalid={Boolean(err("logo"))}
          />
          {err("logo") ? (
            <p className="text-destructive text-xs">{t(err("logo")!)}</p>
          ) : null}
        </div>
      </div>
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

export function BrandManager({ brands }: { brands: AdminBrand[] }) {
  const t = useTranslations("AdminBrands");
  const tc = useTranslations("Common");
  const [mode, setMode] = useState<"new" | string | null>(null);
  const { confirm, dialog } = useConfirm();
  const confirmedRef = useRef(false);

  return (
    <div className="space-y-4">
      {dialog}
      {mode === "new" ? (
        <BrandForm onDone={() => setMode(null)} />
      ) : (
        <Button onClick={() => setMode("new")}>
          <Plus className="size-4" />
          {t("addBrand")}
        </Button>
      )}

      {brands.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      ) : (
        <ul className="space-y-2">
          {brands.map((b) =>
            mode === b.id ? (
              <li key={b.id}>
                <BrandForm brand={b} onDone={() => setMode(null)} />
              </li>
            ) : (
              <li
                key={b.id}
                className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{b.name}</p>
                  <p className="text-muted-foreground text-xs">
                    <span className="font-mono">/{b.slug}</span>
                    {" · "}
                    {t("productsCount", { count: b.productCount })}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setMode(b.id)}
                >
                  <Pencil className="size-3.5" />
                  {t("edit")}
                </Button>
                {b.productCount === 0 ? (
                  <form
                    action={deleteBrand}
                    onSubmit={(e) => {
                      if (confirmedRef.current) {
                        confirmedRef.current = false;
                        return;
                      }
                      e.preventDefault();
                      const form = e.currentTarget;
                      void confirm(tc("cannotUndo"), {
                        title: t("confirmDelete"),
                        confirmLabel: t("delete"),
                        destructive: true,
                      }).then((ok) => {
                        if (!ok) return;
                        confirmedRef.current = true;
                        form.requestSubmit();
                      });
                    }}
                  >
                    <input type="hidden" name="id" value={b.id} />
                    <Button
                      size="sm"
                      variant="ghost"
                      type="submit"
                      className="text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                      {t("delete")}
                    </Button>
                  </form>
                ) : (
                  <span className="text-muted-foreground text-xs">
                    {t("deleteBlocked")}
                  </span>
                )}
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
