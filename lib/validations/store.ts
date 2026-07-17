import { z } from "zod";

import { SLUG_RE } from "@/lib/slug";

// Error messages are stable KEYS translated by the client via the
// `SellerSettings` i18n namespace (same pattern as lib/validations/auth.ts).

export const storeSettingsSchema = z.object({
  name: z.string().trim().min(2, "nameShort").max(60, "nameLong"),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "slugShort")
    .max(60, "slugLong")
    .regex(SLUG_RE, "slugInvalid"),
  description: z.string().trim().max(500, "descriptionLong").optional(),
  returnPolicy: z.string().trim().max(1000, "policyLong").optional(),
  shippingPolicy: z.string().trim().max(1000, "policyLong").optional(),
  contact: z.string().trim().max(160, "contactLong").optional(),
});

export type StoreSettingsInput = z.infer<typeof storeSettingsSchema>;

// Shape stored in Store.policies (Json column).
export type StorePolicies = {
  returnPolicy?: string;
  shippingPolicy?: string;
  contact?: string;
};
