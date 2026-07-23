// Vehicle-aware capacity for Hezalli Express couriers.
//
// Assignment used to measure a driver's load as a bare shipment count, where
// an envelope and a washing machine both counted as "1" and a bicycle courier
// could be handed a parcel only a van can move. This module gives every
// vehicle a carrying profile (max weight, max volume, max simultaneous
// parcels, and the longest single item that physically fits) and prices each
// parcel by the weight and size of its items, so the auto-assigner
// (lib/courier-assign.ts) can skip couriers whose vehicle can't take the job.
//
// Item weight/size comes from Product.weightGrams and Product.dimensions,
// falling back to the product's category delivery defaults
// (Category.defaultWeightGrams / defaultDimensions), then to small-parcel
// constants — so unlabeled items still consume capacity instead of being
// invisible to it.
//
// Manual dispatch is deliberately NOT gated: ops can always assign anything to
// anyone from the dispatch board (same philosophy as lib/cod-guard.ts).
import { prisma } from "@/lib/prisma";

export type VehicleCapacity = {
  maxWeightGrams: number;
  maxVolumeCm3: number;
  maxParcels: number;
  // Longest single side of any one item the vehicle can physically carry —
  // a 2 m curtain rod is light and low-volume yet impossible on a motorbike.
  maxItemLongestSideCm: number;
};

// What each vehicle can reasonably carry at once. Keys mirror VEHICLE_TYPES
// (lib/validations/courier.ts). A parcel that doesn't fit any active courier
// simply stays unassigned for dispatch to route manually.
export const VEHICLE_CAPACITY: Record<string, VehicleCapacity> = {
  // ~a backpack
  foot: {
    maxWeightGrams: 10_000,
    maxVolumeCm3: 30_000,
    maxParcels: 4,
    maxItemLongestSideCm: 50,
  },
  // ~rear rack + panniers
  bicycle: {
    maxWeightGrams: 15_000,
    maxVolumeCm3: 60_000,
    maxParcels: 6,
    maxItemLongestSideCm: 60,
  },
  // ~delivery box + footboard
  motorbike: {
    maxWeightGrams: 30_000,
    maxVolumeCm3: 150_000,
    maxParcels: 12,
    maxItemLongestSideCm: 60,
  },
  // ~trunk + back seat
  car: {
    maxWeightGrams: 150_000,
    maxVolumeCm3: 1_500_000,
    maxParcels: 30,
    maxItemLongestSideCm: 180,
  },
  // ~cargo bay
  van: {
    maxWeightGrams: 500_000,
    maxVolumeCm3: 6_000_000,
    maxParcels: 60,
    maxItemLongestSideCm: 300,
  },
};

// Small-parcel assumptions for items with no weight/size anywhere (product or
// category): roughly a 500 g shoebox.
export const DEFAULT_ITEM_WEIGHT_GRAMS = 500;
export const DEFAULT_ITEM_VOLUME_CM3 = 4_000;
export const DEFAULT_ITEM_LONGEST_SIDE_CM = 25;

// Real items don't tessellate — a parcel of oddly-shaped goods takes more
// space than the sum of its boxes. Applied once per parcel's summed volume.
export const PACKING_FACTOR = 1.25;

/** Box dimensions in centimeters, the documented Product.dimensions shape. */
export type DimensionsCm = { l: number; w: number; h: number };

/** Everything capacity checks need to know about one parcel. */
export type ParcelMetrics = {
  weightGrams: number;
  volumeCm3: number; // packed volume (PACKING_FACTOR applied)
  longestSideCm: number; // longest single side of any item in the parcel
};

export const ZERO_METRICS: ParcelMetrics = {
  weightGrams: 0,
  volumeCm3: 0,
  longestSideCm: 0,
};

/**
 * Validate a Product.dimensions / Category.defaultDimensions Json value into
 * `{ l, w, h }` cm, or null when absent/malformed. Sides must be positive
 * finite numbers ≤ 10 m — anything else is treated as "not provided".
 */
export function parseDimensions(value: unknown): DimensionsCm | null {
  if (typeof value !== "object" || value === null) return null;
  const { l, w, h } = value as Record<string, unknown>;
  const side = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 1000
      ? v
      : null;
  const pl = side(l);
  const pw = side(w);
  const ph = side(h);
  return pl != null && pw != null && ph != null
    ? { l: pl, w: pw, h: ph }
    : null;
}

/** The carrying profile for a vehicle, or null when the vehicle is unknown. */
export function capacityFor(
  vehicleType: string | null | undefined,
): VehicleCapacity | null {
  if (!vehicleType) return null;
  return VEHICLE_CAPACITY[vehicleType] ?? null;
}

/**
 * Whether a courier's vehicle has room left for one more parcel, on top of
 * what they already carry: parcel count, total weight, total volume, and the
 * parcel's longest item must all fit. Unknown vehicles (couriers granted the
 * role without an application) are unconstrained — the pre-vehicle behavior —
 * so legacy drivers keep receiving work.
 */
export function hasRoomFor(
  courier: {
    vehicleType: string | null;
    load: number;
    loadWeightGrams: number;
    loadVolumeCm3: number;
  },
  parcel: ParcelMetrics,
): boolean {
  const cap = capacityFor(courier.vehicleType);
  if (!cap) return true;
  return (
    courier.load < cap.maxParcels &&
    parcel.longestSideCm <= cap.maxItemLongestSideCm &&
    courier.loadWeightGrams + parcel.weightGrams <= cap.maxWeightGrams &&
    courier.loadVolumeCm3 + parcel.volumeCm3 <= cap.maxVolumeCm3
  );
}

/** One order line with its resolved shipping attributes (nulls → defaults). */
export type ItemShipping = {
  quantity: number;
  weightGrams: number | null;
  dims: DimensionsCm | null;
};

/** Combine order lines into one parcel's weight/volume/longest-side. */
export function metricsOfItems(items: ItemShipping[]): ParcelMetrics {
  let weight = 0;
  let rawVolume = 0;
  let longest = 0;
  for (const i of items) {
    weight += i.quantity * (i.weightGrams ?? DEFAULT_ITEM_WEIGHT_GRAMS);
    rawVolume +=
      i.quantity *
      (i.dims ? i.dims.l * i.dims.w * i.dims.h : DEFAULT_ITEM_VOLUME_CM3);
    longest = Math.max(
      longest,
      i.dims
        ? Math.max(i.dims.l, i.dims.w, i.dims.h)
        : DEFAULT_ITEM_LONGEST_SIDE_CM,
    );
  }
  return {
    weightGrams: weight,
    volumeCm3: Math.round(rawVolume * PACKING_FACTOR),
    longestSideCm: longest,
  };
}

/**
 * Parcel metrics per sub-order: each line's product weight/dimensions with the
 * category delivery defaults as fallback (small-parcel constants when neither
 * exists, including when the variant no longer exists). Bulk so the assigner
 * can weigh a whole fleet's in-flight load in two queries.
 */
export async function subOrderMetrics(
  subOrderIds: string[],
): Promise<Map<string, ParcelMetrics>> {
  const unique = [...new Set(subOrderIds)];
  const out = new Map<string, ParcelMetrics>(
    unique.map((id) => [id, ZERO_METRICS]),
  );
  if (unique.length === 0) return out;

  const items = await prisma.orderItem.findMany({
    where: { subOrderId: { in: unique } },
    select: { subOrderId: true, variantId: true, quantity: true },
  });
  if (items.length === 0) return out;

  const variantIds = [...new Set(items.map((i) => i.variantId))];
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
    select: {
      id: true,
      product: {
        select: {
          weightGrams: true,
          dimensions: true,
          category: {
            select: { defaultWeightGrams: true, defaultDimensions: true },
          },
        },
      },
    },
  });
  const shippingByVariant = new Map(
    variants.map((v) => {
      const p = v.product;
      return [
        v.id,
        {
          weightGrams: p.weightGrams ?? p.category.defaultWeightGrams ?? null,
          dims:
            parseDimensions(p.dimensions) ??
            parseDimensions(p.category.defaultDimensions),
        },
      ];
    }),
  );

  const linesBySubOrder = new Map<string, ItemShipping[]>();
  for (const i of items) {
    const shipping = shippingByVariant.get(i.variantId) ?? {
      weightGrams: null,
      dims: null,
    };
    const lines = linesBySubOrder.get(i.subOrderId) ?? [];
    lines.push({ quantity: i.quantity, ...shipping });
    linesBySubOrder.set(i.subOrderId, lines);
  }
  for (const [subOrderId, lines] of linesBySubOrder) {
    out.set(subOrderId, metricsOfItems(lines));
  }
  return out;
}

/** Parcel metrics of one sub-order (see subOrderMetrics). */
export async function subOrderMetric(
  subOrderId: string,
): Promise<ParcelMetrics> {
  return (await subOrderMetrics([subOrderId])).get(subOrderId) ?? ZERO_METRICS;
}
