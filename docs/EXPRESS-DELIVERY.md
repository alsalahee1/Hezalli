# Hezalli Express — reference & runbook

Hezalli Express is the platform's own express delivery tier: buyers pay for a
faster option at checkout, sellers hand parcels to Hezalli Express, and a fleet
of couriers delivers them through a phone-first driver app while ops watch a
dispatch board. This doc is the single reference for how it fits together and
how to operate it.

---

> **Related:** parcels can optionally route through a partner-operated hub
> ("Hezalli Point") between the seller and the courier — see
> [DELIVERY-POINTS.md](./DELIVERY-POINTS.md) for that flow, its statuses
> (`AT_POINT`, `RETURNED_TO_POINT`), and the point operator's fee ledger.

## 1. What it is

A buyer choosing **Express** for a seller's items at checkout pays a separate
fee for a faster delivery-time estimate, fulfilled by the platform-managed
carrier **Hezalli Express**. Standard (zone-based) shipping is unchanged and
remains the default.

```
Buyer picks Standard | Express per seller  →  pays  →  order CONFIRMED
        ↓
Seller "Ship" via Hezalli Express          →  Shipment (IN_TRANSIT), sub-order SHIPPED
        ↓
Parcel auto-assigned to a courier          →  (balanced or nearest — see §4)
        ↓
Courier: Picked up → Out for delivery → Delivered   (QR-driven driver app)
        ↓
COD cash captured on delivery; buyer confirms receipt → COMPLETED → seller settled
        ↓
Public tracking + SLA/at-risk visibility throughout
```

## 2. Data model

| Model / field | Purpose |
| --- | --- |
| `SubOrder.shippingMethod` (`STANDARD` \| `EXPRESS`) | The tier the buyer chose and paid for. |
| `ShippingRate.expressFeeUsd` | Optional per-zone express price; falls back to the platform default. |
| `Carrier.platformManaged` | Marks **Hezalli Express** as ours (vs. third-party couriers). |
| `Role.COURIER` | Delivery driver. |
| `Shipment.driverId` → `User` | The assigned courier (null = unassigned / third-party). |
| `CourierLocation` (userId, lat, lng, governorate) | A driver's last shared location, mapped to a governorate, for "nearest" dispatch. |
| `Address.lat` / `Address.lng` | Optional buyer-pinned destination coordinates, for true distance-based routing. |
| `ShipmentEvent` | The status timeline shown on tracking and the driver/seller views. |

Fee quoting lives in `lib/shipping.ts` (`quoteShippingForStores` returns a
`{ standard, express }` option per store; `resolveShippingChoice` picks the
buyer's tier **server-side** — the client-supplied fee is never trusted). The
shared delivery transition (COD capture, auto-complete countdown, buyer notice)
lives in `lib/shipment-core.ts` and is used by **both** the seller and the
courier so there is exactly one money-path.

## 3. Configuration (admin → Platform settings)

All keys live in `PlatformSetting` (see `lib/settings.ts` for defaults).

| Setting | Default | Meaning |
| --- | --- | --- |
| `express_enabled` | `true` | Master switch; off = only Standard at checkout. |
| `default_express_fee` | `10` | Express price when a store hasn't set a per-zone fee. |
| `std_eta_min_days` / `std_eta_max_days` | `3` / `7` | Standard delivery-time estimate. |
| `express_eta_min_days` / `express_eta_max_days` | `1` / `2` | Express delivery-time estimate. |
| `express_auto_assign` | `true` | Auto-hand shipped Express parcels to a courier. |
| `courier_assign_strategy` | `balanced` | `balanced` (fewest active jobs) or `nearest` (destination governorate, then fewest jobs). |

Rules worth knowing:

- **"Free over X" waives Standard only.** Express is a paid premium and is
  always charged.
- Express fee = the seller's per-zone `expressFeeUsd` if set, else
  `default_express_fee`.

## 4. Auto-assignment strategies

When a platform-managed parcel is shipped and `express_auto_assign` is on, it is
assigned automatically (`lib/courier-assign.ts`, best-effort, race-guarded):

- **Balanced** — the active courier with the fewest in-flight (`SHIPPED`)
  deliveries; ties broken deterministically.
- **Nearest** — in order of preference:
  1. **True distance** — when the buyer pinned the address (`Address.lat/lng`)
     and couriers have shared their location, the closest by great-circle
     (`haversineKm`) distance, tie-broken by load.
  2. **Governorate locality** — otherwise a courier in the destination
     governorate (mapped from their shared GPS via `lib/yemen-geo.ts`), then
     least-loaded.
  3. **Balanced** — otherwise global least-loaded.

Two refinements apply under both strategies (`lib/courier-capacity.ts`):

- **Vehicle capacity** — each vehicle from the courier application (foot,
  bicycle, motorbike, car, van) has a carrying profile: a max total weight and
  a max number of simultaneous parcels (`VEHICLE_CAPACITY`). A parcel's weight
  is the sum of its lines' `quantity × Product.weightGrams` (unlabeled items
  count as `DEFAULT_ITEM_WEIGHT_GRAMS` so they still consume capacity).
  Couriers whose vehicle can't take the parcel — too heavy outright, or the
  driver is already at their weight/parcel limit — are skipped. The approved
  vehicle is copied to `User.courierVehicleType` on application approval;
  couriers without one (granted the role manually) are unconstrained, matching
  the pre-capacity behavior. If **no** active courier can carry a parcel it
  stays unassigned and dispatch routes it manually.
- **Batching** — a courier already carrying an in-flight parcel to the same
  destination governorate is preferred over everyone else (before distance and
  load), capacity permitting. Orders heading the same way accumulate onto one
  trip instead of fanning out across the fleet one-parcel-per-driver.

Ops can always reassign from the dispatch board — capacity gates the automatic
paths only (same philosophy as the COD credit guard).

## 5. Operating it — by role

**Buyer**
- Chooses Standard/Express per seller at checkout; sees fee + ETA.
- Tracks at `/{locale}/track/{trackingNumber}` (also reachable via the QR on the
  parcel label). Sees an Express badge, estimated delivery, and the status
  timeline. Confirms receipt from their order page to complete + settle.

**Seller**
- `/seller/settings/shipping`: set a per-zone Express fee (optional).
- Order page → **Ship**: pick a carrier (defaults to **Hezalli Express** for an
  Express order), enter tracking; the shipping label carries a scannable QR.

**Ops / Admin**
- `/admin/dispatch`: every in-flight Express parcel, its assigned courier, and
  its SLA state. Overdue parcels sort first; a header summary counts
  overdue / due-soon. Assign or reassign any parcel from here.
- `/admin/settings`: the toggles in §3.
- `/admin/couriers`: review **"become a driver"** applications and manage the
  fleet. **Approve** grants the applicant the **Courier** role (they can then
  sign into `/driver`); **Reject** records an optional note (they may resubmit).
  Both decisions are audited. The page also lists all active couriers.

### Driver onboarding

Couriers are never self-granted the role — they apply and an admin approves
(mirroring how large last-mile fleets onboard: apply → review → activate):

1. A signed-in user opens **`/drive`** ("Deliver with Hezalli", linked in the
   footer) and submits the application (name, phone, governorate/city, vehicle).
   This creates a **PENDING** `CourierApplication` — no access is granted yet.
2. An admin reviews it at **`/admin/couriers`** and approves or rejects.
3. On approval the **Courier** role is added; the driver signs in and lands in
   `/driver`. (A signed-in non-courier visiting `/driver` is sent to `/drive`.)

For local/test use, the seeded `driver@hezalli.com` (`hezalli123`) already has
the role, so onboarding can be skipped. An admin can also grant the role
directly in the DB if needed.

**Courier (driver app — `/driver`, installable to the home screen)**
- Opt-in **Share location** (enables Nearest dispatch and shows their
  governorate on dispatch).
- **Jobs**: assigned deliveries, most-urgent-first (overdue / due-soon badges).
- **Scan**: camera QR scan of a parcel label (manual tracking entry as
  fallback) → opens that job.
- **Job**: address + tap-to-call, COD-collection callout, and
  **Picked up → Out for delivery → Delivered**.

## 6. SLA / at-risk

A parcel's **due-by** = `shippedAt` + its tier's max ETA (`lib/sla.ts`).
`overdue` (past due), `due_soon` (within 12h), or `on_track`. Surfaced as badges
+ sorting on both the dispatch board and the driver's job list so late parcels
get chased before the promise is missed.

## 7. Limitations & roadmap

- **Coordinates are optional / opt-in.** Buyers pin their address via the
  browser's geolocation ("Pin my location"); there's no draggable map picker
  yet, so a buyer setting an address they aren't physically at can't pin it.
  When coordinates are absent on either side, routing degrades to
  governorate-locality then load (see §4). A visual map picker (and reverse
  geocoding) is the next upgrade.
- **Status transitions are human-driven.** Sellers/couriers tap the buttons;
  there is no external carrier feed or GPS breadcrumb trail.
- **The public tracking QR** encodes an absolute URL built from
  `NEXT_PUBLIC_APP_URL` — set it to the real domain in production (see
  `DEPLOYMENT.md`) or scanned codes point at `localhost`.

## 8. Tests

| Area | File |
| --- | --- |
| Fee quoting + tier selection | `tests/unit/shipping.test.ts`, `tests/integration/shipping.test.ts` |
| SLA classification | `tests/unit/sla.test.ts` |
| Governorate mapping | `tests/unit/yemen-geo.test.ts` |
| Courier dispatch + delivery (COD) | `tests/integration/courier.test.ts` |
| Auto-assignment (balanced / nearest) | `tests/integration/courier-assign.test.ts`, `tests/integration/courier-nearest.test.ts` |

Run: `npm run test:unit` (no DB) and `npm run test:integration` (needs Postgres;
CI provisions one).
