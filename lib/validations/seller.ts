import { z } from "zod";

// Error messages are stable KEYS translated by the client via the `Sell`
// i18n namespace (same pattern as lib/validations/auth.ts).

const phone = z
  .string()
  .trim()
  .regex(/^\+?[\d\s-]{7,20}$/, "phoneInvalid");

export const becomeSellerSchema = z.object({
  storeName: z
    .string()
    .trim()
    .min(2, "storeNameShort")
    .max(60, "storeNameLong"),
  description: z.string().trim().max(500, "descriptionLong").optional(),
  // Optional here; sellers can add/replace their contact phone later.
  phone: z.union([phone, z.literal("")]).optional(),
  acceptTerms: z.literal(true, { error: "termsRequired" }),
});

export type BecomeSellerInput = z.infer<typeof becomeSellerSchema>;
