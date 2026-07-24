import { describe, expect, it } from "vitest";

import {
  loginSchema,
  registerSchema,
  requestResetSchema,
  resetPasswordSchema,
} from "@/lib/validations/auth";

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

describe("registerSchema optional home governorate", () => {
  const base = {
    name: "New Buyer",
    email: "buyer@example.com",
    password: "password123",
    confirmPassword: "password123",
    acceptTerms: true,
  };

  it("accepts a valid governorate value", () => {
    const r = registerSchema.safeParse({ ...base, homeGovernorate: "Sana'a" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.homeGovernorate).toBe("Sana'a");
  });

  it("treats blank / missing as undefined (skipped)", () => {
    const blank = registerSchema.safeParse({ ...base, homeGovernorate: "" });
    expect(blank.success).toBe(true);
    if (blank.success) expect(blank.data.homeGovernorate).toBeUndefined();

    const missing = registerSchema.safeParse(base);
    expect(missing.success).toBe(true);
    if (missing.success) expect(missing.data.homeGovernorate).toBeUndefined();
  });

  it("rejects a value that is not a real governorate", () => {
    const r = registerSchema.safeParse({
      ...base,
      homeGovernorate: "Atlantis",
    });
    expect(r.success).toBe(false);
  });
});

describe("requestResetSchema", () => {
  it("trims and lowercases the email like the other auth forms", () => {
    const r = requestResetSchema.safeParse({ email: "  User@Hezalli.COM " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe("user@hezalli.com");
  });

  it("rejects an invalid email", () => {
    const r = requestResetSchema.safeParse({ email: "nope" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("emailInvalid");
  });
});

describe("resetPasswordSchema", () => {
  const base = {
    token: "a".repeat(64),
    password: "password123",
    confirmPassword: "password123",
  };

  it("accepts a matching password with a token present", () => {
    expect(resetPasswordSchema.safeParse(base).success).toBe(true);
  });

  it("requires the token (empty link → resetTokenMissing)", () => {
    const r = resetPasswordSchema.safeParse({ ...base, token: "" });
    expect(r.success).toBe(false);
    if (!r.success)
      expect(
        r.error.issues.some((i) => i.message === "resetTokenMissing"),
      ).toBe(true);
  });

  it("rejects a password shorter than 8 characters", () => {
    const r = resetPasswordSchema.safeParse({
      ...base,
      password: "short",
      confirmPassword: "short",
    });
    expect(r.success).toBe(false);
    if (!r.success)
      expect(r.error.issues.some((i) => i.message === "passwordShort")).toBe(
        true,
      );
  });

  it("rejects when the confirmation does not match", () => {
    const r = resetPasswordSchema.safeParse({
      ...base,
      confirmPassword: "different1",
    });
    expect(r.success).toBe(false);
    if (!r.success)
      expect(r.error.issues.some((i) => i.message === "passwordMismatch")).toBe(
        true,
      );
  });
});
