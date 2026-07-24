import { z } from "zod";

// Error messages are stable KEYS translated by the client via the
// `MerchantApply` i18n namespace (same pattern as lib/validations/point.ts).

const phone = z
  .string()
  .trim()
  .regex(/^\+?[\d\s-]{7,20}$/, "phoneInvalid");

// Merchant business categories. Kept as a small fixed list (not the product
// taxonomy) — these describe the kind of shop, shown on the pay page.
export const MERCHANT_CATEGORIES = [
  "restaurant",
  "grocery",
  "retail",
  "pharmacy",
  "electronics",
  "services",
  "other",
] as const;

export const applyMerchantSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(2, "businessNameShort")
    .max(80, "businessNameLong"),
  fullName: z.string().trim().min(2, "fullNameShort").max(80, "fullNameLong"),
  phone,
  category: z.enum(MERCHANT_CATEGORIES, { error: "categoryRequired" }),
  governorate: z.string().trim().min(2, "governorateRequired").max(60),
  city: z.string().trim().min(1, "cityRequired").max(60),
  notes: z.string().trim().max(500, "notesLong").optional(),
  acceptTerms: z.literal(true, { error: "termsRequired" }),
});

export type ApplyMerchantInput = z.infer<typeof applyMerchantSchema>;
