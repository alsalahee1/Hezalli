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
| `courier_offer_timeout_minutes` | `60` | Minutes a driver has to accept an offered parcel before it cascades to the next driver. `0` = classic forced assignment, no accept step. |
| `courier_offer_max_rounds` | `3` | How many drivers to try before alerting dispatch to assign manually. |
| `dispatch_hours_start` / `dispatch_hours_end` | `8` / `21` | Dispatch window, Yemen local hours (0–23). Outside it parcels queue and offer clocks pause; equal values = 24/7. |
| `seller_ship_days` | `5` | Unshipped CONFIRMED/PROCESSING sub-orders auto-cancel (paid buyers refunded) after this many days; seller warned a day before. `0` = off. |
| `driver_min_acceptance_rate` | `0` | Drivers under this 90-day offer-acceptance percent (with ≥ `driver_acceptance_min_offers` answers) stop getting auto-offers. `0` = off. |
| `driver_acceptance_min_offers` | `10` | Answered-offer sample a driver needs before the acceptance gate applies. |
| `job_board_enabled` | `false` | Post unassigned parcels on the open driver job board (§4b) — any eligible driver can claim, first tap wins. |
| `job_board_window_minutes` | `15` | How long a parcel stays board-only before push-offers ALSO start chasing a driver. `0` = both channels at once. |
| `job_board_max_active_jobs` | `10` | A driver already holding this many in-flight deliveries can't claim more from the board. `0` = no cap. |
| `pickup_deadline_hours` | `0` | Hours an ACCEPTED job (tapped offer or board claim) may sit without a single scan before the sweep takes it back and re-dispatches it. Forced/manual assignments are exempt. `0` = off. |

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
  bicycle, motorbike, car, van, truck) has a carrying profile: max total
  weight, max total volume, max simultaneous parcels, and the longest single
  item that physically fits (`VEHICLE_CAPACITY` — a 2 m curtain rod is light
  and low-volume yet impossible on a motorbike). The shipped numbers are code
  defaults; delivery staff can tune any vehicle live (no deploy) from the
  delivery-manager portal's **Vehicle capacity** page — overrides are stored
  in the `vehicle_capacity` platform setting, merged field-by-field over the
  defaults (`effectiveVehicleCapacity`), audited via the
  `setVehicleCapacity` action, and resettable per vehicle. A parcel's metrics
  come from its lines, resolved per field in this order:
  1. the values **snapshotted at checkout** (`OrderItem.weightGramsSnapshot` /
     `dimensionsSnapshot` / `sizeClassSnapshot`, frozen like `titleSnapshot`
     so catalog edits can't rewrite in-flight parcels);
  2. the live exact fields (`Product.weightGrams` / `dimensions`, the
     optional "exact size" inputs on the seller product form);
  3. the product's **size class** (`Product.sizeClass` — the primary seller
     input: envelope / small / medium / large / xlarge / oversized, each
     mapped to representative weight+dimensions in `SIZE_CLASS_PROFILES`);
  4. the category's delivery defaults (`Category.defaultSizeClass` /
     `defaultWeightGrams` / `defaultDimensions` — one setting covers e.g. all
     refrigerators; editable in the admin category manager and, via the
     narrow audited `setCategoryShippingDefaults` action, on the
     delivery-manager portal's "Delivery defaults" page);
  5. small-parcel constants, so unlabeled items still consume capacity.

  Summed parcel volume is inflated by `PACKING_FACTOR` since real items don't
  tessellate. Couriers whose vehicle can't take the parcel — too heavy or too
  long outright, or the driver is already at a weight/volume/parcel limit —
  are skipped. The approved vehicle is copied to `User.courierVehicleType` on
  application approval; couriers without one (granted the role manually) are
  unconstrained, matching the pre-capacity behavior. If **no** active courier
  can carry a parcel it stays unassigned and dispatch routes it manually.
- **Batching** — a courier already carrying an in-flight parcel to the same
  destination governorate is preferred over everyone else (before distance and
  load), capacity permitting. Orders heading the same way accumulate onto one
  trip instead of fanning out across the fleet one-parcel-per-driver.
- **Freight** (`xlarge` / `oversized` classes — the Amazon-XL pattern):
  - **Direct only** — never routed through a Hezalli Point (a point is a
    corner shop with shelves, not a freight terminal): checkout refuses the
    PICKUP tier for freight groups (`pickupNotForFreight`) and the seller
    ship action refuses point routing (`freightDirect`).
  - **Appointment required** — while scheduling is on
    (`delivery_window_days` > 0), a freight order must carry a delivery
    window (`deliveryWindowRequiredFreight`): someone has to be home for a
    fridge, and a failed truck run costs ten times a failed motorbike run.
  - **No batching** — a truck run is one or two big items on an appointment,
    not a parcel round, so freight skips the same-destination bonus.
  - **`oversized` never auto-assigns** — a sofa needs crew planning; it
    always goes through manual dispatch (the offer cascade escalates it).
  - The dispatch board badges freight parcels, and the driver job page tells
    the courier to bring a helper (two-person delivery).

Ops can always reassign from the dispatch board — capacity gates the automatic
paths only (same philosophy as the COD credit guard). To keep manual calls
informed, the dispatch board shows each parcel's weight and each courier's
vehicle + current load in the assign pickers, and a courier's vehicle can be
changed (audited, `setCourierVehicle`) from their admin detail page.

## 4a. Job offers — consent, clocks, cascade

Auto-assignment **offers** the parcel to the chosen driver instead of forcing
it (`ShipmentOffer`; driver UI on `/driver`). The full lifecycle:

1. **Offer** — the picked driver gets a notification + push and
   `courier_offer_timeout_minutes` to answer. Accepting is a tap — or
   implicit: the first scan (pickup, point collection, any advance) settles
   the offer as `ACCEPTED`. Manual dispatch assignment bypasses offers
   entirely (ops decisions are authoritative) and voids any open offer.
2. **Decline** — the driver picks a reason (`too_far`, `off_duty`,
   `too_many_jobs`, `other`); the parcel is released and immediately
   re-offered to the next-best courier, **excluding everyone who already got
   an offer** for it. Declining is only possible before the first scan — after
   that, problems go through `courierFailDelivery` or dispatch.
3. **Expire** — unanswered offers lapse via the hourly sweep
   (`lib/offer-sweep.ts`, wired into `/api/cron/auto-complete`) and cascade
   the same way. A driver who already advanced the parcel is treated as
   having accepted; nothing is taken away mid-job.
4. **Escalate** — after `courier_offer_max_rounds` drivers (or when nobody
   eligible is left during dispatch hours) the parcel is flagged
   (`Shipment.assignmentEscalatedAt`, one-shot) and DELIVERY_MANAGER + ADMIN
   are told to assign manually. A manual assignment clears the flag.

**Dispatch hours** (`lib/dispatch-hours.ts`, Asia/Aden wall clock): outside
`dispatch_hours_start–end` nothing is offered — night orders queue, offer
clocks pause, and the first sweep after opening runs the **morning wave**,
offering out everything that accumulated overnight. Nobody is pinged at 3 AM,
and no offer silently expires while the fleet sleeps.

**Pickup deadline** (`pickup_deadline_hours`, off by default): accepting is a
commitment, but only a scan proves the parcel changed hands. A driver who
tapped accept (or claimed off the board, §4b) and still hasn't made a single
scan after the deadline loses the job automatically: the sweep expires their
offer (`reason: pickup_timeout`), releases the parcel, notifies them, and
re-dispatches — the cascade moves it to the next courier (their expired row
excludes them), and with the board on it reappears there too. Only untouched
parcels qualify (the same `offerOpenStatuses` rule as declines), so a driver
who already collected the parcel can never lose it in software while holding
it physically. Forced and manual assignments carry no accepted-offer row and
are exempt — ops decisions stay with ops.

**Reliability** (`lib/courier-reliability.ts`): every answered offer feeds a
90-day acceptance rate per driver. Ties in ranking go to the more reliable
driver, the dispatch board shows the rate next to each courier, and with
`driver_min_acceptance_rate` set, chronic decliners are paused from
auto-offers (manual dispatch still works — same escape hatch as the COD
guard).

**Nothing goes quiet**: escalated parcels still unassigned re-alert staff
every 24h (aggregated) during dispatch hours, and the stuck-parcel sweep
re-alerts every 48h while a parcel stays un-moved. The related seller-side
clock lives in `lib/seller-sla.ts`: unshipped sub-orders warn the seller at
`seller_ship_days − 1` and auto-cancel (refund-if-paid) at the deadline.

## 4b. The open job board — pull dispatch

With `job_board_enabled` on (`lib/job-board.ts`), dispatch flips from push to
**pull-first**: instead of the platform picking one driver, a shipped parcel
is posted on an open board (`/driver/board`) that every eligible courier can
browse. Each card shows what a driver weighs before committing — destination
city + governorate, parcel size (piece count), the COD amount to collect (or
"prepaid"), **their delivery fee**, the scheduled window, and the distance
when both sides have shared coordinates — but **not** the buyer's name, phone,
or street address; those stay private until the job is claimed. Local drivers
(shared location in the destination governorate) are notified when a parcel
lands on the board; with no local drivers, everyone active is.

- **Claiming** (`courierClaimJob`) is first-tap-wins: one conditional update
  on the unassigned row, so a race has exactly one winner and the loser sees
  "taken". A claim is recorded as an `ACCEPTED` `ShipmentOffer`, so pull and
  push feed the same reliability history — and like an accepted push offer it
  is a commitment: no silent hand-backs, problems go through
  `courierFailDelivery` or dispatch.
- **The same gates as auto-dispatch apply.** COD-blocked drivers
  (`lib/cod-guard.ts`) can browse but not claim;
  `job_board_max_active_jobs` caps how many in-flight jobs a driver may hold
  before claiming more (anti-hoarding, anti-cherry-picking); and the vehicle
  capacity check (`lib/courier-capacity.ts` — weight, volume, parcel count,
  longest item) gates claims exactly like auto-assign. The board shows each
  parcel's approximate weight and marks jobs that don't fit the driver's
  vehicle instead of offering a claim the server would refuse.
- **The push cascade is the safety net, not a rival.** A parcel unclaimed
  after `job_board_window_minutes` gets push-offers from the sweep exactly as
  §4a describes — and stays claimable the whole time, since both paths simply
  set `Shipment.driverId` on the unassigned row. With `express_auto_assign`
  off the platform runs pull-only: parcels stay on the board until claimed or
  manually dispatched.
- **Dispatch hours are respected**: night parcels queue un-boarded and the
  first sweep after opening posts them (the board's morning wave). Escalated
  parcels remain claimable — a claim clears `assignmentEscalatedAt` just like
  a manual assignment.

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
