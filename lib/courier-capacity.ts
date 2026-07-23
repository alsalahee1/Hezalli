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
import { isFreightClass } from "@/lib/validations/product";

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
  // ~flatbed / box truck: the freight tier (fridges, furniture)
  truck: {
    maxWeightGrams: 3_000_000,
    maxVolumeCm3: 20_000_000,
    maxParcels: 20,
    maxItemLongestSideCm: 500,
  },
};

// Representative weight/size for each standard package class
// (lib/validations/product.ts SIZE_CLASSES) — what a seller's two-second
// picker answer means to the capacity math. Exact product fields override.
export const SIZE_CLASS_PROFILES: Record<
  string,
  { weightGrams: number; dims: DimensionsCm }
> = {
  envelope: { weightGrams: 500, dims: { l: 30, w: 25, h: 3 } },
  small: { weightGrams: 3_000, dims: { l: 35, w: 25, h: 15 } },
  medium: { weightGrams: 10_000, dims: { l: 55, w: 45, h: 35 } },
  large: { weightGrams: 25_000, dims: { l: 80, w: 60, h: 60 } },
  xlarge: { weightGrams: 70_000, dims: { l: 75, w: 75, h: 180 } },
  oversized: { weightGrams: 200_000, dims: { l: 250, w: 120, h: 100 } },
};

// Freight classes ship direct (never via a Hezalli Point — nobody lifts a
// fridge over a shop counter) and require a delivery appointment. "oversized"
// additionally never auto-assigns: a sofa needs crew planning, so it always
// goes through manual dispatch. Defined in lib/validations/product.ts
// (client-safe) so the checkout UI shares the rule; re-exported here for the
// server-side capacity code that already imports from this module.
export { isFreightClass };

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
  // Any item classed xlarge/oversized: direct-only + appointment-required,
  // and (freight) exempt from same-destination batching — a truck run is an
  // appointment, not a parcel round.
  freight: boolean;
  // Any item classed oversized: never auto-assigned, manual dispatch only.
  oversized: boolean;
};

export const ZERO_METRICS: ParcelMetrics = {
  weightGrams: 0,
  volumeCm3: 0,
  longestSideCm: 0,
  freight: false,
  oversized: false,
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

// Ops can tune the vehicle profiles from the delivery-manager portal without
// a deploy: overrides live in the PlatformSetting table under this key as
// { [vehicleType]: Partial<VehicleCapacity> } and are merged over the code
// defaults — so clearing a vehicle's override reverts it to the shipped
// numbers. Managed by setVehicleCapacity (lib/actions/courier.ts), audited.
export const VEHICLE_CAPACITY_SETTING_KEY = "vehicle_capacity";

/**
 * Merge stored overrides over the shipped VEHICLE_CAPACITY defaults. Unknown
 * vehicles and malformed/out-of-range values are ignored field-by-field, so a
 * bad write can never take the capacity table down.
 */
export function mergeVehicleCapacity(
  overrides: unknown,
): Record<string, VehicleCapacity> {
  const out: Record<string, VehicleCapacity> = { ...VEHICLE_CAPACITY };
  if (typeof overrides !== "object" || overrides === null) return out;
  const num = (v: unknown, max: number): number | null =>
    typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= max
      ? Math.round(v)
      : null;
  for (const [vehicle, raw] of Object.entries(overrides)) {
    const base = out[vehicle];
    if (!base || typeof raw !== "object" || raw === null) continue;
    const c = raw as Record<string, unknown>;
    out[vehicle] = {
      maxWeightGrams: num(c.maxWeightGrams, 20_000_000) ?? base.maxWeightGrams,
      maxVolumeCm3: num(c.maxVolumeCm3, 100_000_000) ?? base.maxVolumeCm3,
      maxParcels: num(c.maxParcels, 500) ?? base.maxParcels,
      maxItemLongestSideCm:
        num(c.maxItemLongestSideCm, 2_000) ?? base.maxItemLongestSideCm,
    };
  }
  return out;
}

/** The live capacity table: stored overrides merged over the code defaults. */
export async function effectiveVehicleCapacity(): Promise<
  Record<string, VehicleCapacity>
> {
  const row = await prisma.platformSetting.findUnique({
    where: { key: VEHICLE_CAPACITY_SETTING_KEY },
    select: { value: true },
  });
  return mergeVehicleCapacity(row?.value);
}

/** The carrying profile for a vehicle, or null when the vehicle is unknown. */
export function capacityFor(
  vehicleType: string | null | undefined,
  table: Record<string, VehicleCapacity> = VEHICLE_CAPACITY,
): VehicleCapacity | null {
  if (!vehicleType) return null;
  return table[vehicleType] ?? null;
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
  table: Record<string, VehicleCapacity> = VEHICLE_CAPACITY,
): boolean {
  const cap = capacityFor(courier.vehicleType, table);
  if (!cap) return true;
  return (
    courier.load < cap.maxParcels &&
    parcel.longestSideCm <= cap.maxItemLongestSideCm &&
    courier.loadWeightGrams + parcel.weightGrams <= cap.maxWeightGrams &&
    courier.loadVolumeCm3 + parcel.volumeCm3 <= cap.maxVolumeCm3
  );
}

/**
 * One order line with its resolved shipping attributes: exact weight/dims
 * (null when unknown) plus the resolved size class. Exact values win; a class
 * fills what's missing via SIZE_CLASS_PROFILES; then small-parcel defaults.
 */
export type ItemShipping = {
  quantity: number;
  weightGrams: number | null;
  dims: DimensionsCm | null;
  sizeClass?: string | null;
};

/** Combine order lines into one parcel's weight/volume/longest-side. */
export function metricsOfItems(items: ItemShipping[]): ParcelMetrics {
  let weight = 0;
  let rawVolume = 0;
  let longest = 0;
  let freight = false;
  let oversized = false;
  for (const i of items) {
    const profile = i.sizeClass ? SIZE_CLASS_PROFILES[i.sizeClass] : undefined;
    const grams =
      i.weightGrams ?? profile?.weightGrams ?? DEFAULT_ITEM_WEIGHT_GRAMS;
    const dims = i.dims ?? profile?.dims ?? null;
    weight += i.quantity * grams;
    rawVolume +=
      i.quantity * (dims ? dims.l * dims.w * dims.h : DEFAULT_ITEM_VOLUME_CM3);
    longest = Math.max(
      longest,
      dims ? Math.max(dims.l, dims.w, dims.h) : DEFAULT_ITEM_LONGEST_SIDE_CM,
    );
    freight ||= isFreightClass(i.sizeClass);
    oversized ||= i.sizeClass === "oversized";
  }
  return {
    weightGrams: weight,
    volumeCm3: Math.round(rawVolume * PACKING_FACTOR),
    longestSideCm: longest,
    freight,
    oversized,
  };
}

/**
 * Parcel metrics per sub-order. Each line's weight/size resolves, in order:
 * the checkout snapshot (OrderItem.*Snapshot — frozen so catalog edits don't
 * rewrite in-flight parcels), the live product, the product's size class
 * profile, the category's delivery defaults (class, then numbers), then
 * small-parcel constants (including when the variant no longer exists). Bulk
 * so the assigner can weigh a whole fleet's in-flight load in two queries.
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
    select: {
      subOrderId: true,
      variantId: true,
      quantity: true,
      weightGramsSnapshot: true,
      dimensionsSnapshot: true,
      sizeClassSnapshot: true,
    },
  });
  if (items.length === 0) return out;

  const variantIds = [...new Set(items.map((i) => i.variantId))];
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
    select: {
      id: true,
      product: {
        select: {
          sizeClass: true,
          weightGrams: true,
          dimensions: true,
          category: {
            select: {
              defaultSizeClass: true,
              defaultWeightGrams: true,
              defaultDimensions: true,
            },
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
          sizeClass: p.sizeClass ?? p.category.defaultSizeClass ?? null,
          weightGrams: p.weightGrams,
          dims: parseDimensions(p.dimensions),
          categoryWeightGrams: p.category.defaultWeightGrams,
          categoryDims: parseDimensions(p.category.defaultDimensions),
        },
      ];
    }),
  );

  const linesBySubOrder = new Map<string, ItemShipping[]>();
  for (const i of items) {
    const live = shippingByVariant.get(i.variantId) ?? {
      sizeClass: null,
      weightGrams: null,
      dims: null,
      categoryWeightGrams: null,
      categoryDims: null,
    };
    // Per field: exact (snapshot, then live product) → size-class profile →
    // category numeric defaults. The class travels along for freight rules.
    const cls = i.sizeClassSnapshot ?? live.sizeClass;
    const profile = cls ? SIZE_CLASS_PROFILES[cls] : undefined;
    const lines = linesBySubOrder.get(i.subOrderId) ?? [];
    lines.push({
      quantity: i.quantity,
      weightGrams:
        i.weightGramsSnapshot ??
        live.weightGrams ??
        profile?.weightGrams ??
        live.categoryWeightGrams,
      dims:
        parseDimensions(i.dimensionsSnapshot) ??
        live.dims ??
        profile?.dims ??
        live.categoryDims,
      sizeClass: cls,
    });
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
