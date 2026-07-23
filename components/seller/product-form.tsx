"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { saveProduct } from "@/lib/actions/product";
import { useRouter } from "@/i18n/navigation";
import { slugify } from "@/lib/slug";
import {
  CONDITIONS,
  type OptionGroup,
  type ProductInput,
  type VariantInput,
} from "@/lib/validations/product";
import {
  MultiImageUploader,
  type UploadedImage,
} from "@/components/upload/multi-image-uploader";
import { VariantEditor } from "@/components/seller/variant-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type EditProduct = {
  id: string;
  titleEn: string;
  titleAr: string;
  descEn: string;
  descAr: string;
  categoryId: string;
  brandId: string;
  condition: string;
  lowStockThreshold: number;
  weightGrams: number | null;
  dimensionsCm: { l: number; w: number; h: number } | null;
  status: string;
  images: UploadedImage[];
  variants: VariantInput[];
};

function deriveGroups(variants: VariantInput[]): OptionGroup[] {
  const keys: string[] = [];
  const valuesByKey = new Map<string, string[]>();
  for (const v of variants) {
    for (const [k, val] of Object.entries(v.attributes || {})) {
      if (!keys.includes(k)) {
        keys.push(k);
        valuesByKey.set(k, []);
      }
      const arr = valuesByKey.get(k)!;
      if (!arr.includes(val)) arr.push(val);
    }
  }
  return keys.map((k) => ({ name: k, values: valuesByKey.get(k)! }));
}

export function ProductForm({
  product,
  categories,
  brands,
}: {
  product?: EditProduct;
  categories: { id: string; label: string }[];
  brands: { id: string; name: string }[];
}) {
  const t = useTranslations("SellerProducts");
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  const [titleEn, setTitleEn] = useState(product?.titleEn ?? "");
  const [images, setImages] = useState<UploadedImage[]>(product?.images ?? []);
  const variantsRef = useRef<VariantInput[]>(product?.variants ?? []);
  const onVariants = useCallback((v: VariantInput[]) => {
    variantsRef.current = v;
  }, []);

  const [pending, setPending] = useState<"draft" | "publish" | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [variantErrors, setVariantErrors] = useState<
    Record<number, Record<string, string>>
  >({});
  const [formError, setFormError] = useState<string | null>(null);

  const err = (f: string) => errors[f];

  async function submit(intent: "draft" | "publish") {
    const fd = new FormData(formRef.current!);
    const weight = fd.get("weightGrams");
    // All three sides make a size; anything less is "not provided".
    const side = (k: string) => Number(fd.get(k)) || 0;
    const dims = { l: side("dimL"), w: side("dimW"), h: side("dimH") };
    const hasDims = dims.l > 0 && dims.w > 0 && dims.h > 0;
    const input: ProductInput = {
      id: product?.id,
      titleEn,
      titleAr: String(fd.get("titleAr") ?? ""),
      descEn: String(fd.get("descEn") ?? ""),
      descAr: String(fd.get("descAr") ?? ""),
      categoryId: String(fd.get("categoryId") ?? ""),
      brandId: String(fd.get("brandId") ?? ""),
      condition: (String(fd.get("condition")) === "USED"
        ? "USED"
        : "NEW") as ProductInput["condition"],
      lowStockThreshold: Number(fd.get("lowStockThreshold") ?? 0) || 0,
      weightGrams: weight ? Number(weight) : null,
      dimensionsCm: hasDims ? dims : null,
      images,
      variants: variantsRef.current,
      intent,
    };

    setPending(intent);
    const res = await saveProduct(input);
    setPending(null);

    if (res.ok) {
      router.push("/seller/products");
      router.refresh();
      return;
    }
    setErrors(res.errors ?? {});
    setVariantErrors(res.variantErrors ?? {});
    setFormError(res.formError ?? null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }

  return (
    <form ref={formRef} className="max-w-3xl space-y-8" noValidate>
      {formError ? (
        <p
          role="alert"
          className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
        >
          {t(formError)}
        </p>
      ) : null}

      {/* Basics */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">{t("basics")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="titleEn">{t("titleEn")}</Label>
            <Input
              id="titleEn"
              value={titleEn}
              onChange={(e) => setTitleEn(e.target.value)}
              aria-invalid={Boolean(err("titleEn"))}
            />
            {err("titleEn") ? (
              <p className="text-destructive text-xs">{t(err("titleEn")!)}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="titleAr">{t("titleAr")}</Label>
            <Input
              id="titleAr"
              name="titleAr"
              dir="rtl"
              defaultValue={product?.titleAr}
              aria-invalid={Boolean(err("titleAr"))}
            />
            {err("titleAr") ? (
              <p className="text-destructive text-xs">{t(err("titleAr")!)}</p>
            ) : null}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="descEn">{t("descEn")}</Label>
            <Textarea
              id="descEn"
              name="descEn"
              rows={4}
              defaultValue={product?.descEn}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="descAr">{t("descAr")}</Label>
            <Textarea
              id="descAr"
              name="descAr"
              dir="rtl"
              rows={4}
              defaultValue={product?.descAr}
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="categoryId">{t("category")}</Label>
            <Select
              id="categoryId"
              name="categoryId"
              defaultValue={product?.categoryId ?? ""}
              aria-invalid={Boolean(err("categoryId"))}
            >
              <option value="">{t("selectCategory")}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
            {err("categoryId") ? (
              <p className="text-destructive text-xs">
                {t(err("categoryId")!)}
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="brandId">{t("brand")}</Label>
            <Select
              id="brandId"
              name="brandId"
              defaultValue={product?.brandId ?? ""}
            >
              <option value="">{t("noBrand")}</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="condition">{t("condition")}</Label>
            <Select
              id="condition"
              name="condition"
              defaultValue={product?.condition ?? "NEW"}
            >
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {t(`condition_${c}`)}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </section>

      {/* Images */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">{t("images")}</h2>
          <p className="text-muted-foreground text-sm">{t("imagesHint")}</p>
        </div>
        {err("images") ? (
          <p className="text-destructive text-xs">{t(err("images")!)}</p>
        ) : null}
        <MultiImageUploader images={images} onChange={setImages} />
      </section>

      {/* Variants & pricing */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">{t("variantsPricing")}</h2>
          <p className="text-muted-foreground text-sm">{t("variantsHint")}</p>
        </div>
        {err("variants") ? (
          <p className="text-destructive text-xs">{t(err("variants")!)}</p>
        ) : null}
        <VariantEditor
          skuBase={slugify(titleEn) || "product"}
          initialGroups={product ? deriveGroups(product.variants) : []}
          initialVariants={product?.variants ?? []}
          errors={variantErrors}
          onChange={onVariants}
        />
      </section>

      {/* Shipping */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">{t("shipping")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="weightGrams">{t("weight")}</Label>
            <Input
              id="weightGrams"
              name="weightGrams"
              type="number"
              min={0}
              dir="ltr"
              defaultValue={product?.weightGrams ?? ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lowStockThreshold">{t("lowStock")}</Label>
            <Input
              id="lowStockThreshold"
              name="lowStockThreshold"
              type="number"
              min={0}
              dir="ltr"
              defaultValue={product?.lowStockThreshold ?? 0}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="dimL">{t("dimensions")}</Label>
            <div className="flex items-center gap-2" dir="ltr">
              {(["dimL", "dimW", "dimH"] as const).map((k, i) => (
                <Input
                  key={k}
                  id={k}
                  name={k}
                  type="number"
                  min={1}
                  max={1000}
                  placeholder={t(k)}
                  className="w-28"
                  aria-invalid={Boolean(err("dimensionsCm"))}
                  defaultValue={
                    product?.dimensionsCm
                      ? [
                          product.dimensionsCm.l,
                          product.dimensionsCm.w,
                          product.dimensionsCm.h,
                        ][i]
                      : ""
                  }
                />
              ))}
            </div>
            {err("dimensionsCm") ? (
              <p className="text-destructive text-xs">
                {t(err("dimensionsCm")!)}
              </p>
            ) : (
              <p className="text-muted-foreground text-xs">
                {t("dimensionsHint")}
              </p>
            )}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-3 border-t pt-6">
        <Button
          type="button"
          onClick={() => submit("publish")}
          disabled={pending !== null}
        >
          {pending === "publish" ? t("publishing") : t("publish")}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => submit("draft")}
          disabled={pending !== null}
        >
          {pending === "draft" ? t("savingDraft") : t("saveDraft")}
        </Button>
      </div>
    </form>
  );
}
