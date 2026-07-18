"use client";

import { useMemo, useState } from "react";
import { EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  createCategory,
  deleteCategory,
  updateCategory,
} from "@/lib/actions/category";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

import { CategoryForm, type CategoryFormData } from "./category-form";

export type AdminCategory = CategoryFormData & {
  productCount: number;
  childCount: number;
};

export function CategoryManager({
  categories,
}: {
  categories: AdminCategory[];
}) {
  const t = useTranslations("AdminCategories");
  const [mode, setMode] = useState<"new" | string | null>(null);

  const childrenOf = useMemo(() => {
    const map = new Map<string | null, AdminCategory[]>();
    for (const c of categories) {
      const key = c.parentId;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    for (const list of map.values())
      list.sort((a, b) => a.position - b.position);
    return map;
  }, [categories]);

  // Eligible parents when editing `id`: everything except itself and its
  // descendants (avoids cycles). For a new category, all are eligible.
  const parentsFor = (id?: string) => {
    const excluded = new Set<string>();
    if (id) {
      const stack = [id];
      while (stack.length) {
        const cur = stack.pop()!;
        excluded.add(cur);
        for (const ch of childrenOf.get(cur) ?? []) stack.push(ch.id);
      }
    }
    return categories
      .filter((c) => !excluded.has(c.id))
      .sort((a, b) => a.position - b.position)
      .map((c) => ({
        id: c.id,
        label: c.parentId ? `— ${c.nameEn}` : c.nameEn,
      }));
  };

  const roots = childrenOf.get(null) ?? [];

  const renderNode = (cat: AdminCategory, depth: number) => {
    const kids = childrenOf.get(cat.id) ?? [];
    const canDelete = cat.productCount === 0 && cat.childCount === 0;
    return (
      <li key={cat.id}>
        {mode === cat.id ? (
          <div style={{ marginInlineStart: depth * 20 }}>
            <CategoryForm
              action={updateCategory}
              category={cat}
              parents={parentsFor(cat.id)}
              onDone={() => setMode(null)}
            />
          </div>
        ) : (
          <div
            className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2"
            style={{ marginInlineStart: depth * 20 }}
          >
            <span className="w-6 text-center">{cat.icon ?? "•"}</span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-medium">
                {cat.nameEn}
                {!cat.isActive ? (
                  <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                    <EyeOff className="size-3" />
                    {t("hidden")}
                  </span>
                ) : null}
              </p>
              <p className="text-muted-foreground text-xs">
                <span dir="rtl">{cat.nameAr}</span>
                {" · "}
                <span className="font-mono">/{cat.slug}</span>
                {" · "}
                {t("productsCount", { count: cat.productCount })}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setMode(cat.id)}>
              <Pencil className="size-3.5" />
              {t("edit")}
            </Button>
            {canDelete ? (
              <form
                action={deleteCategory}
                onSubmit={(e) => {
                  if (!window.confirm(t("confirmDelete"))) e.preventDefault();
                }}
              >
                <input type="hidden" name="id" value={cat.id} />
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
              <span
                className="text-muted-foreground text-xs"
                title={t("deleteBlockedHint")}
              >
                {t("deleteBlocked")}
              </span>
            )}
          </div>
        )}
        {kids.length > 0 ? (
          <ul className="mt-2 space-y-2">
            {kids.map((k) => renderNode(k, depth + 1))}
          </ul>
        ) : null}
      </li>
    );
  };

  return (
    <div className="space-y-4">
      {mode === "new" ? (
        <CategoryForm
          action={createCategory}
          parents={parentsFor()}
          onDone={() => setMode(null)}
        />
      ) : (
        <Button onClick={() => setMode("new")}>
          <Plus className="size-4" />
          {t("addCategory")}
        </Button>
      )}

      {roots.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      ) : (
        <ul className={cn("space-y-2")}>
          {roots.map((r) => renderNode(r, 0))}
        </ul>
      )}
    </div>
  );
}
