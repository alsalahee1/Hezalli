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

export const categorySchema = z.object({
  nameEn: z.string().trim().min(2, "nameShort").max(60, "nameLong"),
  nameAr: z.string().trim().min(1, "nameArShort").max(60, "nameLong"),
  slug,
  icon: z.string().trim().max(16).optional(), // an emoji or short glyph
  parentId: z.string().trim().optional(),
  position: z.coerce.number().int().min(0, "positionInvalid").max(9999),
  isActive: z.boolean().optional(),
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
