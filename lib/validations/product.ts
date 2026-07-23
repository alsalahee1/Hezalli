import { z } from "zod";

// Types + scalar validation for the product form. Variant/image/publish rules
// with cross-field logic live in lib/actions/product.ts. Error messages are
// KEYS under the `SellerProducts` namespace.

export const CONDITIONS = ["NEW", "USED"] as const;
export type Condition = (typeof CONDITIONS)[number];

// SKU: letters, numbers, dot, dash, underscore.
export const SKU_RE = /^[A-Za-z0-9._-]+$/;

export type ProductImageInput = { url: string; alt?: string };
export type OptionGroup = { name: string; values: string[] };
export type VariantInput = {
  name: string;
  attributes: Record<string, string>;
  sku: string;
  price: number;
  compareAtPrice?: number | null;
  stock: number;
};

// Package size in cm, stored as Product.dimensions `{ l, w, h }`. Optional —
// with weight, it lets dispatch match parcels to delivery-vehicle capacity.
export type DimensionsCmInput = { l: number; w: number; h: number };

// Standard package sizes — the seller-friendly way to describe an item
// without a ruler. Each class maps to representative weight/dimensions in
// lib/courier-capacity.ts (SIZE_CLASS_PROFILES); exact fields override it.
// "xlarge"/"oversized" are freight: direct-only, appointment-required
// (docs/EXPRESS-DELIVERY.md §4). Labels live under `SellerProducts.size_*`.
export const SIZE_CLASSES = [
  "envelope",
  "small",
  "medium",
  "large",
  "xlarge",
  "oversized",
] as const;
export type SizeClass = (typeof SIZE_CLASSES)[number];

// Freight classes ship direct (never via a Hezalli Point) and require a
// delivery appointment; "oversized" additionally never auto-assigns. Lives
// here (client-safe) so checkout UI can apply the rules too.
export function isFreightClass(sizeClass: string | null | undefined): boolean {
  return sizeClass === "xlarge" || sizeClass === "oversized";
}

export type ProductInput = {
  id?: string;
  titleEn: string;
  titleAr: string;
  descEn: string;
  descAr: string;
  categoryId: string;
  brandId: string;
  condition: Condition;
  lowStockThreshold: number;
  sizeClass?: SizeClass | null;
  weightGrams?: number | null;
  dimensionsCm?: DimensionsCmInput | null;
  images: ProductImageInput[];
  variants: VariantInput[];
  intent: "draft" | "publish";
};

// Scalar fields — always required for draft or publish.
export const productScalarsSchema = z.object({
  titleEn: z.string().trim().min(2, "titleEnShort").max(140, "titleLong"),
  titleAr: z.string().trim().max(140, "titleLong"),
  descEn: z.string().trim().max(4000, "descLong"),
  descAr: z.string().trim().max(4000, "descLong"),
  categoryId: z.string().trim().min(1, "categoryRequired"),
  brandId: z.string().trim(),
  condition: z.enum(CONDITIONS),
  lowStockThreshold: z.coerce.number().int().min(0).max(100000),
  sizeClass: z.union([z.enum(SIZE_CLASSES), z.null()]).optional(),
  weightGrams: z.union([
    z.coerce.number().int().min(0).max(5_000_000),
    z.null(),
  ]),
  dimensionsCm: z
    .union([
      z.object({
        l: z.coerce.number().min(1, "dimensionsInvalid").max(1000, "dimensionsInvalid"),
        w: z.coerce.number().min(1, "dimensionsInvalid").max(1000, "dimensionsInvalid"),
        h: z.coerce.number().min(1, "dimensionsInvalid").max(1000, "dimensionsInvalid"),
      }),
      z.null(),
    ])
    .optional(),
});
