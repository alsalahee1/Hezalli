import { z } from "zod";

// Error messages are stable KEYS translated by the client via the
// `PointApply` i18n namespace (same pattern as lib/validations/courier.ts).

const phone = z
  .string()
  .trim()
  .regex(/^\+?[\d\s-]{7,20}$/, "phoneInvalid");

export const applyPointSchema = z.object({
  pointName: z
    .string()
    .trim()
    .min(2, "pointNameShort")
    .max(80, "pointNameLong"),
  fullName: z.string().trim().min(2, "fullNameShort").max(80, "fullNameLong"),
  phone,
  governorate: z.string().trim().min(2, "governorateRequired").max(60),
  city: z.string().trim().min(1, "cityRequired").max(60),
  addressLine: z.string().trim().min(5, "addressShort").max(200, "addressLong"),
  notes: z.string().trim().max(500, "notesLong").optional(),
  // Optional precise location dropped by the applicant (GPS or map pin) so the
  // hub lands on the map without an admin geocoding the written address.
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  acceptTerms: z.literal(true, { error: "termsRequired" }),
});

export type ApplyPointInput = z.infer<typeof applyPointSchema>;
