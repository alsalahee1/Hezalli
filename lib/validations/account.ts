import { z } from "zod";

import { GOVERNORATE_VALUES } from "@/lib/yemen";

// Error messages are stable KEYS translated by the client via the `Account`
// i18n namespace (same pattern as lib/validations/auth.ts).

const phone = z
  .string()
  .trim()
  .regex(/^\+?[\d\s-]{7,20}$/, "phoneInvalid");

export const profileSchema = z.object({
  name: z.string().trim().min(2, "nameShort").max(80, "nameLong"),
  // Optional: an empty field clears the phone.
  phone: z.union([phone, z.literal("")]).optional(),
});

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, "currentPasswordRequired"),
    newPassword: z.string().min(8, "passwordShort").max(100, "passwordLong"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    error: "passwordMismatch",
    path: ["confirmPassword"],
  });

export const addressSchema = z.object({
  fullName: z.string().trim().min(2, "fullNameShort").max(80),
  phone,
  governorate: z
    .string()
    .refine(
      (v) => (GOVERNORATE_VALUES as readonly string[]).includes(v),
      "governorateRequired",
    ),
  city: z.string().trim().min(1, "cityRequired").max(80),
  line1: z.string().trim().min(1, "line1Required").max(160),
  line2: z.string().trim().max(160).optional(),
  notes: z.string().trim().max(300).optional(),
  isDefault: z.boolean().optional(),
});

export type ProfileInput = z.infer<typeof profileSchema>;
export type AddressInput = z.infer<typeof addressSchema>;
