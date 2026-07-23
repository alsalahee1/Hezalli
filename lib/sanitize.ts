import sanitizeHtml from "sanitize-html";

// Server-side sanitizer for admin-authored CMS HTML, which is rendered raw via
// dangerouslySetInnerHTML at /p/[slug]. Defense-in-depth: even though only
// ADMINs can author CMS pages (saveCmsPage is requireAdminId-gated), we strip
// scripts, event handlers, and unsafe URL schemes on save so a misused/hijacked
// admin session can't persist stored XSS, and so the render never depends on
// the CSP alone.
const CMS_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "p",
    "br",
    "hr",
    "blockquote",
    "pre",
    "code",
    "ul",
    "ol",
    "li",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "span",
    "div",
    "a",
    "img",
    "figure",
    "figcaption",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "title", "width", "height"],
    "*": ["class"],
  },
  // Only safe URL schemes — blocks javascript:, vbscript:, and (for both links
  // and images) data: URIs, which can smuggle active content.
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowProtocolRelative: false,
  // External links can't reach window.opener or leak the referrer.
  transformTags: {
    a: sanitizeHtml.simpleTransform(
      "a",
      { rel: "noopener noreferrer nofollow" },
      true,
    ),
  },
};

/** Sanitize one CMS body string. Returns "" for nullish input. */
export function sanitizeCmsHtml(dirty: string | null | undefined): string {
  return sanitizeHtml(dirty ?? "", CMS_OPTIONS);
}
