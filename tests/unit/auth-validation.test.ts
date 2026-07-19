import { describe, expect, it } from "vitest";

import { loginSchema, registerSchema } from "@/lib/validations/auth";

describe("loginSchema email normalization", () => {
  it("accepts a correct email and lowercases it", () => {
    const r = loginSchema.safeParse({
      email: "Admin@Hezalli.com",
      password: "secret",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe("admin@hezalli.com");
  });

  it("trims surrounding whitespace so sign-in isn't blocked by a stray space", () => {
    for (const email of [
      " admin@hezalli.com",
      "admin@hezalli.com ",
      "  admin@hezalli.com  ",
      "admin@hezalli.com\n",
    ]) {
      const r = loginSchema.safeParse({ email, password: "secret" });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.email).toBe("admin@hezalli.com");
    }
  });

  it("still rejects a genuinely invalid email", () => {
    const r = loginSchema.safeParse({ email: "not-an-email", password: "x" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("emailInvalid");
  });

  it("rejects a blank/whitespace-only email", () => {
    const r = loginSchema.safeParse({ email: "   ", password: "x" });
    expect(r.success).toBe(false);
  });
});

describe("registerSchema email normalization", () => {
  it("trims and lowercases the email", () => {
    const r = registerSchema.safeParse({
      name: "New Buyer",
      email: "  New.Buyer@Example.COM ",
      password: "password123",
      confirmPassword: "password123",
      acceptTerms: true,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe("new.buyer@example.com");
  });
});
