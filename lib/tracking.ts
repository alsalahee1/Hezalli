// Build a carrier's public tracking URL from its template. Carriers store a
// template with a `{tracking}` placeholder (e.g. https://carrier/track/{tracking}).
export function buildTrackingUrl(
  template: string | null | undefined,
  trackingNumber: string | null | undefined,
): string | null {
  if (!template || !trackingNumber) return null;
  return template.replace(/\{tracking\}/gi, encodeURIComponent(trackingNumber));
}
