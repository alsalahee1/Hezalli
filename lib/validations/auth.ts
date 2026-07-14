import { z } from "zod";

// Validation schemas for the auth forms. Error messages are stable KEYS (not
// prose) that the client forms translate through the `Auth` i18n namespace, so
// validation runs on the server (server actions) while wording stays localized.

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, "nameShort").max(80, "nameLong"),
    email: z.email("emailInvalid").transform((v) => v.toLowerCase()),
    password: z.string().min(8, "passwordShort").max(100, "passwordLong"),
    confirmPassword: z.string(),
    acceptTerms: z.literal(true, { error: "termsRequired" }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: "passwordMismatch",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  email: z.email("emailInvalid").transform((v) => v.toLowerCase()),
  password: z.string().min(1, "passwordRequired"),
  remember: z.boolean().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

// Flatten a ZodError into { field: firstMessageKey } for form rendering.
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !out[key]) out[key] = issue.message;
  }
  return out;
}
