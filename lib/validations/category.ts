import { z } from "zod";

import { SLUG_RE } from "@/lib/slug";

// Error messages are stable KEYS translated by the client via the
// `AdminCategories` / `AdminBrands` i18n namespaces.

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "slugShort")
  .max(60, "slugLong")
  .regex(SLUG_RE, "slugInvalid");

const dimensionSide = z.coerce
  .number()
  .min(1, "dimensionsInvalid")
  .max(1000, "dimensionsInvalid");

export const categorySchema = z.object({
  nameEn: z.string().trim().min(2, "nameShort").max(60, "nameLong"),
  nameAr: z.string().trim().min(1, "nameArShort").max(60, "nameLong"),
  slug,
  icon: z.string().trim().max(16).optional(), // an emoji or short glyph
  parentId: z.string().trim().optional(),
  position: z.coerce.number().int().min(0, "positionInvalid").max(9999),
  isActive: z.boolean().optional(),
  // Delivery defaults: typical unit size/weight for products in this
  // category, used for courier capacity when a product has none of its own.
  // The class list mirrors SIZE_CLASSES (lib/validations/product.ts).
  defaultSizeClass: z.union([
    z.enum(["envelope", "small", "medium", "large", "xlarge", "oversized"]),
    z.null(),
  ]),
  defaultWeightGrams: z.union([
    z.coerce
      .number()
      .int()
      .min(0, "weightInvalid")
      .max(5_000_000, "weightInvalid"),
    z.null(),
  ]),
  defaultDimensionsCm: z.union([
    z.object({ l: dimensionSide, w: dimensionSide, h: dimensionSide }),
    z.null(),
  ]),
});

export const brandSchema = z.object({
  name: z.string().trim().min(2, "nameShort").max(60, "nameLong"),
  slug,
  logo: z
    .string()
    .trim()
    .url("logoInvalid")
    .max(500)
    .optional()
    .or(z.literal("")),
});

export type CategoryInput = z.infer<typeof categorySchema>;
export type BrandInput = z.infer<typeof brandSchema>;
