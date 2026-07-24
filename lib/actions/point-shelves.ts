"use server";

// Shelf-registry management for a delivery point (docs §42e). Registering bays
// turns on auto-placement: the receive scan then stamps the least-busy bay
// itself. Seeded from the printable labels grid so the same rows × bays the
// owner prints become the point's shelves.
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireDeliveryPoint } from "@/lib/authz";
import type { PointShelfZone } from "@/lib/generated/prisma/client";
import { canManagePoint } from "@/lib/point-access";
import { prisma } from "@/lib/prisma";

type Result = { ok?: boolean; error?: string; count?: number };

const ZONES: PointShelfZone[] = ["PICKUP", "DISPATCH", "RETURNS"];
function parseZone(v: unknown): PointShelfZone | null {
  return typeof v === "string" && (ZONES as string[]).includes(v)
    ? (v as PointShelfZone)
    : null;
}

// One lettered row of bays, as the zone editor shows it: how many bays it has
// and the zone/capacity they currently share (the first bay's, since the editor
// only ever sets a whole row at once).
export type ShelfRow = {
  letter: string;
  count: number;
  zone: PointShelfZone | null;
  capacity: number | null;
};

// Same clamps as the labels sheet so the registry can't be seeded larger than
// what can be printed.
const MAX_ROWS = 12;
const MAX_BAYS = 20;

// Build the code grid: lettered rows (A, B, …) × numbered bays (1..bays).
function gridCodes(rows: number, bays: number): string[] {
  const r = Math.min(MAX_ROWS, Math.max(1, Math.trunc(rows) || 0));
  const b = Math.min(MAX_BAYS, Math.max(1, Math.trunc(bays) || 0));
  const codes: string[] = [];
  for (let i = 0; i < r; i++) {
    const letter = String.fromCharCode(65 + i);
    for (let j = 1; j <= b; j++) codes.push(`${letter}${j}`);
  }
  return codes;
}

// How many bays this point has registered — the "auto-placement is on" signal.
export async function pointShelfCount(): Promise<number> {
  const gate = await requireDeliveryPoint();
  if (!gate) return 0;
  return prisma.pointShelf.count({ where: { pointId: gate.pointId } });
}

// Register (or top up) the point's shelves from a rows × bays grid. Additive:
// creates any missing bays and leaves existing ones — and any parcels resting
// on them — untouched. Owner/manager only.
export async function registerPointShelves(
  rows: number,
  bays: number,
): Promise<Result> {
  const gate = await requireDeliveryPoint();
  if (!gate || !canManagePoint(gate.access)) return { error: "forbidden" };

  const codes = gridCodes(rows, bays);
  if (codes.length === 0) return { error: "badInput" };

  await prisma.pointShelf.createMany({
    data: codes.map((code) => ({ pointId: gate.pointId, code })),
    skipDuplicates: true,
  });

  const count = await prisma.pointShelf.count({
    where: { pointId: gate.pointId },
  });
  const locale = await getLocale();
  revalidatePath(`/${locale}/point/labels`);
  return { ok: true, count };
}

// Turn auto-placement off by clearing the registry. Held parcels keep their
// shelfCode; only future receives stop being auto-placed. Owner/manager only.
export async function clearPointShelves(): Promise<Result> {
  const gate = await requireDeliveryPoint();
  if (!gate || !canManagePoint(gate.access)) return { error: "forbidden" };

  await prisma.pointShelf.deleteMany({ where: { pointId: gate.pointId } });
  const locale = await getLocale();
  revalidatePath(`/${locale}/point/labels`);
  return { ok: true, count: 0 };
}

// The registered bays collapsed to their lettered rows, for the zone editor.
// A point arranges shelving by unit (a row = a shelf unit), so zones and caps
// are set per row rather than per individual bay.
export async function pointShelfRows(): Promise<ShelfRow[]> {
  const gate = await requireDeliveryPoint();
  if (!gate) return [];
  const bays = await prisma.pointShelf.findMany({
    where: { pointId: gate.pointId },
    orderBy: { code: "asc" },
    select: { code: true, zone: true, capacity: true },
  });
  const rows = new Map<string, ShelfRow>();
  for (const b of bays) {
    const letter = b.code[0]?.toUpperCase() ?? "?";
    const row = rows.get(letter);
    if (row) row.count += 1;
    else
      rows.set(letter, {
        letter,
        count: 1,
        zone: b.zone,
        capacity: b.capacity,
      });
  }
  return [...rows.values()].sort((a, b) => a.letter.localeCompare(b.letter));
}

// Set the zone and per-bay capacity for whole rows at once. Each entry applies
// to every bay whose code starts with that row letter. Owner/manager only.
export async function savePointShelfZones(
  updates: { letter: string; zone: string | null; capacity: number | null }[],
): Promise<Result> {
  const gate = await requireDeliveryPoint();
  if (!gate || !canManagePoint(gate.access)) return { error: "forbidden" };

  await prisma.$transaction(
    updates
      .filter((u) => /^[A-Za-z]$/.test(u.letter))
      .map((u) => {
        const cap =
          u.capacity != null && Number.isFinite(u.capacity) && u.capacity > 0
            ? Math.trunc(u.capacity)
            : null;
        return prisma.pointShelf.updateMany({
          where: {
            pointId: gate.pointId,
            code: { startsWith: u.letter.toUpperCase() },
          },
          data: { zone: parseZone(u.zone), capacity: cap },
        });
      }),
  );

  const locale = await getLocale();
  revalidatePath(`/${locale}/point/labels`);
  return { ok: true };
}
