// Vehicle-aware capacity for Hezalli Express couriers.
//
// Assignment used to measure a driver's load as a bare shipment count, where
// an envelope and a washing machine both counted as "1" and a bicycle courier
// could be handed a parcel only a van can move. This module gives every
// vehicle a carrying profile (max weight + max simultaneous parcels) and
// prices each parcel by the weight of its items, so the auto-assigner
// (lib/courier-assign.ts) can skip couriers whose vehicle can't take the job.
//
// Manual dispatch is deliberately NOT gated: ops can always assign anything to
// anyone from the dispatch board (same philosophy as lib/cod-guard.ts).
import { prisma } from "@/lib/prisma";

export type VehicleCapacity = {
  maxWeightGrams: number;
  maxParcels: number;
};

// What each vehicle can reasonably carry at once. Keys mirror VEHICLE_TYPES
// (lib/validations/courier.ts). A parcel that doesn't fit any active courier
// simply stays unassigned for dispatch to route manually.
export const VEHICLE_CAPACITY: Record<string, VehicleCapacity> = {
  foot: { maxWeightGrams: 10_000, maxParcels: 4 },
  bicycle: { maxWeightGrams: 15_000, maxParcels: 6 },
  motorbike: { maxWeightGrams: 30_000, maxParcels: 12 },
  car: { maxWeightGrams: 150_000, maxParcels: 30 },
  van: { maxWeightGrams: 500_000, maxParcels: 60 },
};

// Sellers may leave Product.weightGrams empty. Assume a small parcel rather
// than zero so unlabeled items still consume capacity instead of being
// invisible to it.
export const DEFAULT_ITEM_WEIGHT_GRAMS = 500;

/** The carrying profile for a vehicle, or null when the vehicle is unknown. */
export function capacityFor(
  vehicleType: string | null | undefined,
): VehicleCapacity | null {
  if (!vehicleType) return null;
  return VEHICLE_CAPACITY[vehicleType] ?? null;
}

/**
 * Whether a courier's vehicle has room left for one more parcel of the given
 * weight, on top of what they already carry. Unknown vehicles (couriers
 * granted the role without an application) are unconstrained — the pre-vehicle
 * behavior — so legacy drivers keep receiving work.
 */
export function hasRoomFor(
  courier: { vehicleType: string | null; load: number; loadWeightGrams: number },
  parcelWeightGrams: number,
): boolean {
  const cap = capacityFor(courier.vehicleType);
  if (!cap) return true;
  return (
    courier.load < cap.maxParcels &&
    courier.loadWeightGrams + parcelWeightGrams <= cap.maxWeightGrams
  );
}

/** Total weight of a set of order lines (quantity × item weight, defaulted). */
export function weightOfItems(
  items: { quantity: number; weightGrams: number | null }[],
): number {
  return items.reduce(
    (sum, i) =>
      sum + i.quantity * (i.weightGrams ?? DEFAULT_ITEM_WEIGHT_GRAMS),
    0,
  );
}

/**
 * Parcel weight per sub-order: each line's quantity × its product's
 * weightGrams (DEFAULT_ITEM_WEIGHT_GRAMS when the seller left it blank or the
 * variant no longer exists). Bulk so the assigner can weigh a whole fleet's
 * in-flight load in two queries.
 */
export async function subOrderWeights(
  subOrderIds: string[],
): Promise<Map<string, number>> {
  const unique = [...new Set(subOrderIds)];
  const out = new Map<string, number>(unique.map((id) => [id, 0]));
  if (unique.length === 0) return out;

  const items = await prisma.orderItem.findMany({
    where: { subOrderId: { in: unique } },
    select: { subOrderId: true, variantId: true, quantity: true },
  });
  if (items.length === 0) return out;

  const variantIds = [...new Set(items.map((i) => i.variantId))];
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
    select: { id: true, product: { select: { weightGrams: true } } },
  });
  const gramsByVariant = new Map(
    variants.map((v) => [v.id, v.product.weightGrams]),
  );

  for (const i of items) {
    const grams =
      gramsByVariant.get(i.variantId) ?? DEFAULT_ITEM_WEIGHT_GRAMS;
    out.set(i.subOrderId, (out.get(i.subOrderId) ?? 0) + i.quantity * grams);
  }
  return out;
}

/** Parcel weight of one sub-order (see subOrderWeights). */
export async function subOrderWeightGrams(subOrderId: string): Promise<number> {
  return (await subOrderWeights([subOrderId])).get(subOrderId) ?? 0;
}
