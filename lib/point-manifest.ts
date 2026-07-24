import type { ManifestRow } from "@/lib/point-core";

export type ManifestGroup = { shelf: string | null; items: ManifestRow[] };

// Group a driver's manifest by shelf bay so the counter collects bay by bay —
// the payoff of co-location at receive. Bays sort naturally (A2 before A10) and
// parcels with no bay come last.
export function groupManifestByShelf(rows: ManifestRow[]): ManifestGroup[] {
  const map = new Map<string, ManifestRow[]>();
  for (const r of rows) {
    const key = r.shelf ?? "";
    const arr = map.get(key);
    if (arr) arr.push(r);
    else map.set(key, [r]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => {
      if (a === "") return 1;
      if (b === "") return -1;
      return a.localeCompare(b, undefined, { numeric: true });
    })
    .map(([shelf, items]) => ({ shelf: shelf || null, items }));
}
