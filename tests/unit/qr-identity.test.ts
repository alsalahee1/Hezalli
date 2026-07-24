import { describe, expect, it } from "vitest";

import { extractUserId } from "@/lib/qr-identity";

describe("extractUserId", () => {
  it("pulls the id out of a full localized pay URL", () => {
    expect(extractUserId("https://hezalli.com/en/pay/u/clx123abc456def")).toBe(
      "clx123abc456def",
    );
    expect(extractUserId("https://hezalli.com/ar/pay/u/clx123abc456def")).toBe(
      "clx123abc456def",
    );
  });

  it("accepts the short u/<id> form pasted by hand", () => {
    expect(extractUserId("u/clx123abc456def")).toBe("clx123abc456def");
    expect(extractUserId("U/clx123abc456def")).toBe("clx123abc456def");
  });

  it("accepts a bare id token", () => {
    expect(extractUserId("clx123abc456def")).toBe("clx123abc456def");
  });

  it("trims surrounding whitespace", () => {
    expect(extractUserId("  u/clx123abc456def \n")).toBe("clx123abc456def");
  });

  it("decodes percent-encoding in the id segment", () => {
    expect(extractUserId("/pay/u/abc%2Fdef")).toBe("abc/def");
  });

  it("rejects codes that aren't ours", () => {
    expect(extractUserId("")).toBeNull();
    expect(extractUserId("   ")).toBeNull();
    // A tracking QR must not be mistaken for a member id.
    expect(
      extractUserId("https://hezalli.com/en/track/YE123456789"),
    ).toBeNull();
    // Pay-request codes (r/<id>) are a different target, not a member.
    expect(extractUserId("/pay/r/req123abc456")).toBeNull();
    // Too short / free text with spaces.
    expect(extractUserId("hi there")).toBeNull();
    expect(extractUserId("abc123")).toBeNull();
  });
});
