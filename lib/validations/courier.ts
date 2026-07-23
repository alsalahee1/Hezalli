import { z } from "zod";

// Error messages are stable KEYS translated by the client via the `Drive`
// i18n namespace (same pattern as lib/validations/seller.ts).

const phone = z
  .string()
  .trim()
  .regex(/^\+?[\d\s-]{7,20}$/, "phoneInvalid");

// Kept in sync with the <select> options in the become-courier form and the
// labels under `Drive.vehicle_*`.
export const VEHICLE_TYPES = [
  "motorbike",
  "car",
  "bicycle",
  "van",
  "truck",
  "foot",
] as const;

export const applyCourierSchema = z.object({
  fullName: z.string().trim().min(2, "fullNameShort").max(80, "fullNameLong"),
  phone,
  governorate: z.string().trim().min(2, "governorateRequired").max(60),
  city: z.string().trim().min(1, "cityRequired").max(60),
  vehicleType: z.enum(VEHICLE_TYPES, { error: "vehicleRequired" }),
  notes: z.string().trim().max(500, "notesLong").optional(),
  acceptTerms: z.literal(true, { error: "termsRequired" }),
});

export type ApplyCourierInput = z.infer<typeof applyCourierSchema>;
