"use server";

// Shelf-registry management for a delivery point (docs §42e). Registering bays
// turns on auto-placement: the receive scan then stamps the least-busy bay
// itself. Seeded from the printable labels grid so the same rows × bays the
// owner prints become the point's shelves.
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireDeliveryPoint } from "@/lib/authz";
import { canManagePoint } from "@/lib/point-access";
import { prisma } from "@/lib/prisma";

type Result = { ok?: boolean; error?: string; count?: number };

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
