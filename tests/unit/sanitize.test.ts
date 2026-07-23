import { describe, expect, it } from "vitest";

import { sanitizeCmsHtml } from "@/lib/sanitize";

describe("sanitizeCmsHtml", () => {
  it("keeps safe formatting tags and text", () => {
    const html =
      "<h2>Title</h2><p>Hello <strong>world</strong> <em>ok</em></p><ul><li>one</li></ul>";
    expect(sanitizeCmsHtml(html)).toBe(html);
  });

  it("strips <script> and its contents", () => {
    const out = sanitizeCmsHtml('<p>hi</p><script>alert(1)</script>');
    expect(out).toBe("<p>hi</p>");
    expect(out).not.toContain("script");
  });

  it("removes inline event handlers", () => {
    const out = sanitizeCmsHtml('<p onclick="steal()">x</p>');
    expect(out).toBe("<p>x</p>");
    expect(out).not.toContain("onclick");
  });

  it("drops javascript: URLs on links", () => {
    const out = sanitizeCmsHtml('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toContain("javascript:");
  });

  it("neutralizes img onerror / data-uri script vectors", () => {
    expect(sanitizeCmsHtml('<img src=x onerror="alert(1)">')).not.toContain(
      "onerror",
    );
    expect(
      sanitizeCmsHtml('<img src="data:text/html,<script>alert(1)</script>">'),
    ).not.toContain("data:");
  });

  it("forces rel=noopener on links that keep an href", () => {
    const out = sanitizeCmsHtml('<a href="https://example.com">x</a>');
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain("noopener");
  });

  it("returns empty string for nullish input", () => {
    expect(sanitizeCmsHtml(null)).toBe("");
    expect(sanitizeCmsHtml(undefined)).toBe("");
  });
});
