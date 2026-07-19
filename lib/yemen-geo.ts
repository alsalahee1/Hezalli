// Approximate center coordinates for each Yemeni governorate, keyed by the
// stable `value` strings in lib/yemen.ts. Used to map a courier's live GPS to a
// governorate for locality-based dispatch — coarse by design (a governorate is
// large), which is all our destination data (governorate-level) can support.
export const GOVERNORATE_CENTROIDS: Record<
  string,
  { lat: number; lng: number }
> = {
  "Amanat Al Asimah": { lat: 15.35, lng: 44.21 },
  "Sana'a": { lat: 15.55, lng: 44.2 },
  Aden: { lat: 12.79, lng: 45.03 },
  Taiz: { lat: 13.58, lng: 44.02 },
  "Al Hudaydah": { lat: 14.8, lng: 42.95 },
  Ibb: { lat: 13.97, lng: 44.18 },
  Dhamar: { lat: 14.55, lng: 44.4 },
  Hajjah: { lat: 15.69, lng: 43.6 },
  Hadhramaut: { lat: 16.0, lng: 49.0 },
  Lahij: { lat: 13.06, lng: 44.88 },
  Abyan: { lat: 13.6, lng: 45.9 },
  "Al Bayda": { lat: 14.0, lng: 45.57 },
  "Sa'dah": { lat: 16.94, lng: 43.76 },
  Shabwah: { lat: 14.5, lng: 46.8 },
  "Al Mahwit": { lat: 15.47, lng: 43.55 },
  Amran: { lat: 15.66, lng: 43.94 },
  "Ad Dali'": { lat: 13.7, lng: 44.73 },
  Raymah: { lat: 14.68, lng: 43.71 },
  "Al Jawf": { lat: 16.6, lng: 45.3 },
  "Ma'rib": { lat: 15.46, lng: 45.32 },
  "Al Mahrah": { lat: 16.5, lng: 51.8 },
  Socotra: { lat: 12.46, lng: 53.82 },
};

// Equirectangular approximation — plenty accurate for "which governorate is
// this point closest to" at Yemen's latitudes, and cheap (no trig per call
// beyond one cosine).
function approxDistanceSq(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const meanLatRad = ((aLat + bLat) / 2) * (Math.PI / 180);
  const x = (aLng - bLng) * Math.cos(meanLatRad);
  const y = aLat - bLat;
  return x * x + y * y;
}

/** The governorate whose center is nearest to the given coordinates. */
export function nearestGovernorate(lat: number, lng: number): string {
  let best = "";
  let bestD = Infinity;
  for (const [name, c] of Object.entries(GOVERNORATE_CENTROIDS)) {
    const d = approxDistanceSq(lat, lng, c.lat, c.lng);
    if (d < bestD) {
      bestD = d;
      best = name;
    }
  }
  return best;
}
