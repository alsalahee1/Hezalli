# Hezalli Delivery Points — design & build plan

Partner-operated parcel hubs ("Hezalli Points"): a local shop owner registers
as a **delivery point**, sellers drop packed parcels there, Hezalli Express
couriers collect assigned parcels from the point via QR handover, and failed
deliveries flow back through the point for reschedule or return-to-seller.
The point operator earns a per-parcel handling fee — they are partners, not
staff.

This is the agent/drop-off-point model used by SPX (Shopee), J&T partner
points, and Amazon Hub — adapted to a single-hop network (no inter-city line
haul yet): one point serves as both drop-off and last-mile station.

> **Status legend:** `[ ]` not started · `[~]` in progress · `[x]` done.
> Update this file as phases land — it is the single source of truth for
> what is finished and what is not.

---

## 1. Parcel lifecycle (target design)

```
Seller "Ship" via Hezalli Express, picks a Point
        ↓  Shipment: LABEL_CREATED  (awaiting drop-off, custody: seller)
Seller brings parcel → point staff SCAN parcel QR      [receive]
        ↓  Shipment: AT_POINT       (custody: point) → courier auto-assigned
Driver arrives → staff scans DRIVER QR → driver manifest shown
Staff/driver SCAN each parcel QR                       [handover]
        ↓  Shipment: OUT_FOR_DELIVERY (custody: driver, buyer notified)
   ├─ Delivered (optional buyer QR / delivery-code verify)
   │      ↓  DELIVERED — COD ledger, point handling fee credited
   └─ Failed (reason recorded, parcel stays with driver)
          ↓  Shipment: FAILED
      Driver returns to point → staff SCAN parcel      [return]
          ↓  Shipment: RETURNED_TO_POINT (custody: point, buyer notified)
       ├─ Buyer reschedules (picks day + note) → handover again → OUT_FOR_DELIVERY
       └─ Attempt limit reached / buyer refused → point marks RTS
              ↓  Shipment: RETURNED — seller notified to collect
```

Chain-of-custody rule: **every handover is a scan** (seller→point,
point→driver, driver→buyer, driver→point, point→seller). At any moment
exactly one party is accountable for the parcel.

Direct courier flow (no point) is unchanged — a point is an optional route
chosen by the seller at ship time.

## 2. Data model

New models / enum changes in `prisma/schema.prisma`:

| Change | Purpose |
| --- | --- |
| `Role.DELIVERY_POINT` | Point operator role (granted on application approval). |
| `DeliveryPoint` | The hub: owner user, name, phone, governorate, city, address line, optional lat/lng, `status` (ACTIVE/SUSPENDED). One per owner. |
| `DeliveryPointApplication` | "Become a point" application, mirrors `CourierApplication` (PENDING → APPROVED/REJECTED, resubmit reuses row). |
| `DeliveryPointLedgerEntry` | Signed ledger: `HANDLING_FEE` (+, per delivered parcel), `PAYOUT` (−, admin pays the point), `ADJUSTMENT` (±). |
| `Shipment.deliveryPointId` | Route: which point the parcel goes through (null = direct). |
| `Shipment.deliveryCode` | Short random code for optional buyer-QR proof of delivery. |
| `Shipment.redeliverAt` / `redeliverNote` | Buyer's requested redelivery day + note after a failed attempt. |
| `ShipmentStatus.AT_POINT` | Parcel received & held at the point. |
| `ShipmentStatus.RETURNED_TO_POINT` | Failed parcel scanned back into the point. |
| `DeliveryAttempt.codeVerified` | DELIVERED attempt was confirmed via the buyer's delivery code/QR. |

New platform settings (`lib/settings.ts` defaults):

| Key | Default | Meaning |
| --- | --- | --- |
| `points_enabled` | `true` | Master switch for routing via points. |
| `point_handling_fee` | `0.5` | USD credited to the point per **delivered** parcel routed through it. |
| `max_delivery_attempts` | `3` | Failed attempts after which the point should return the parcel to the seller. |

## 3. QR codes (three of them)

1. **Parcel QR** — already exists (shipping label encodes the tracking URL);
   all point scans resolve a parcel by tracking token, same as the driver app.
2. **Driver collection QR** — driver app shows a QR encoding
   `hezalli:driver:<courierId>`; point staff scan it to open that driver's
   manifest (their assigned parcels held at this point).
3. **Buyer delivery QR** — order page shows a QR of the shipment's
   `deliveryCode` while out for delivery; the driver can scan/enter it at the
   doorstep for verified proof of delivery. **Optional** — delivery works
   without it (photo/recipient-name proof unchanged).

## 4. Custody & money rules

- Fees: the point earns `point_handling_fee` only when a routed parcel
  reaches DELIVERED (recorded inside the shared delivery transaction in
  `lib/shipment-core.ts`, the single money path).
- COD stays on the courier ledger exactly as today (driver collects, driver
  remits to Hezalli). Points do not touch cash in v1.
- Liability by custody: lost while `AT_POINT`/`RETURNED_TO_POINT` → point;
  lost while `OUT_FOR_DELIVERY`/`FAILED` → driver. The scan trail is the
  evidence; admins settle via ledger `ADJUSTMENT`s.
- RTS (`RETURNED`) leaves the sub-order for ops to resolve with existing
  cancel/refund tools in v1 (no automatic refund).

## 5. Build phases & checklist

### Phase 1 — Schema & settings
- [x] Prisma models: `DeliveryPoint`, `DeliveryPointApplication`, `DeliveryPointLedgerEntry` + enums (`DeliveryPointStatus`, `PointLedgerType`), `Role.DELIVERY_POINT`
- [x] `Shipment` additions: `deliveryPointId`, `deliveryCode`, `redeliverAt`, `redeliverNote`; `DeliveryAttempt.codeVerified`
- [x] `ShipmentStatus` + `AT_POINT`, `RETURNED_TO_POINT`
- [x] Migration SQL (`prisma/migrations/.../delivery_points`)
- [x] Settings defaults: `points_enabled`, `point_handling_fee`, `max_delivery_attempts`

### Phase 2 — Core libs
- [x] `lib/authz.ts`: `requireDeliveryPoint()` (active owner of an ACTIVE point)
- [x] `lib/point-core.ts`: receive / handover / return-to-point / return-to-seller transitions (scan-driven, event-logged, race-guarded)
- [x] `lib/point-ledger.ts`: fee accrual, balance summary (mirrors courier ledger)
- [x] `lib/shipment-core.ts`: credit point handling fee on DELIVERED; record `codeVerified` proof
- [x] Ship flow: `shipSubOrder` accepts optional `deliveryPointId` (platform-managed only) → `LABEL_CREATED`, auto-assign deferred to point receive; `deliveryCode` minted for platform-managed parcels

### Phase 3 — Server actions
- [x] `lib/actions/point-application.ts`: apply + admin review (approve grants role & creates point)
- [x] `lib/actions/point.ts`: `pointReceiveParcel`, `pointHandoverParcel`, `pointReceiveReturn`, `pointReturnToSeller` (all by tracking token)
- [x] `lib/actions/point-ledger.ts` (admin): payout + adjustment
- [x] Buyer: `requestRedelivery(subOrderId, date, note)` (only while FAILED / RETURNED_TO_POINT)
- [x] Driver: delivery-code verification wired into `courierAdvance` DELIVERED proof

### Phase 4 — Point operator app (`/point`)
- [x] Layout + tab bar (Parcels · Scan · Ledger), role-guarded like `/driver`
- [x] Dashboard: parcels grouped by state (awaiting drop-off, at point, out with drivers, returned) + redelivery dates
- [x] Scan page: camera QR scanner with mode picker (Receive / Handover / Return) + manual tracking entry; handover mode accepts a driver-QR scan to filter the manifest
- [x] Ledger page: balance + entries

### Phase 5 — Driver / seller / buyer touchpoints
- [x] Driver page: "My collection QR" card; job page shows pickup point; delivered dialog gets optional delivery-code field
- [x] Seller ship dialog: optional point selector (active points, platform carrier only)
- [x] Buyer order page: delivery QR + code while out for delivery; reschedule form after a failed attempt
- [x] Public tracking timeline: labels for the two new statuses

### Phase 6 — Admin
- [x] `/admin/points`: list points (status toggle), review applications, ledger with payout/adjustment recording
- [x] Settings page: the three new keys editable

### Phase 7 — i18n, tests, docs
- [x] `messages/en.json` + `messages/ar.json`: `Point`, `AdminPoints` namespaces + Driver/Orders/SellerOrders additions
- [x] Integration tests: application approval, receive→handover→deliver (fee ledger), fail→return→reschedule→re-handover, RTS after max attempts, authz guards
- [x] `docs/EXPRESS-DELIVERY.md` cross-link + this file kept current

## 6. v1.1 — Buyer pickup from point (PUDO)

The buyer chooses **"collect from a Hezalli Point"** at checkout instead of
home delivery: the seller drops the parcel at the buyer's chosen point, the
buyer is notified when it's ready, shows their delivery QR/code at the
counter, pays COD cash there, and the point marks it delivered. No courier is
involved at all — failed doorstep attempts disappear for these orders, and
the point still earns its handling fee. This pulls in **point cash handling**
(the counter collects COD), so the point ledger is split into an earnings
side and a cash side, mirroring the courier ledger.

```
Checkout: buyer picks PICKUP for a store group + ONE point for the order
        ↓  SubOrder.shippingMethod = PICKUP, SubOrder.pickupPointId set
Seller "Ship" (platform carrier) → route FORCED to the buyer's point
        ↓  LABEL_CREATED → point receives [scan] → AT_POINT
Buyer notified "ready for pickup — bring your code"   (no courier assigned)
        ↓
Point scans buyer's delivery QR (or types the code)   [pickup]
        ↓  code must match → DELIVERED (codeVerified proof)
COD cash → point ledger COD_COLLECTED · handling fee credited as usual
Point remits cash to Hezalli → admin records COD_REMITTANCE
```

Rules: pickup is free for the buyer by default (`pickup_fee` setting);
driver handover and doorstep-fail actions are blocked for PICKUP parcels;
the pickup scan requires the buyer's code — it is the proof of handover.

### Build checklist (v1.1)

#### Phase A — Schema, settings & quotes
- [x] `ShippingMethod.PICKUP`, `SubOrder.pickupPointId`, `PointLedgerType.COD_COLLECTED` / `COD_REMITTANCE` + migration
- [x] Settings: `pickup_fee` (USD, default 0) editable in Admin → Settings
- [x] `lib/shipping.ts`: `pickup` option (when points enabled + an active point exists) + `resolveShippingChoice` support

#### Phase B — Order & custody flow
- [x] `placeOrder`: accepts `PICKUP` per store + one `pickupPointId` per order (validated ACTIVE)
- [x] `shipSubOrder`: PICKUP sub-orders route to the buyer's point automatically (platform carrier required)
- [x] `point-core`: receive → "ready for pickup" notice, no courier auto-assign; handover/RTS scans reject PICKUP parcels
- [x] `pointBuyerPickup(code)`: resolve by delivery code, deliver with `codeVerified` proof, COD cash → `COD_COLLECTED`
- [x] `point-ledger`: summary split (earnings vs cash-on-hand); admin `remittance` kind on the payout action

#### Phase C — UI
- [x] Checkout: PICKUP option per store group + one point picker for the order
- [x] Point app: "Pickup" scan mode (buyer QR/code) showing the COD amount to collect; dashboard pickup badge; ledger page cash tiles
- [x] Admin points: cash-on-hand column + remittance recording; settings field for `pickup_fee`
- [x] Buyer order page: "collect from {point}" card with address + code; seller ship form shows the forced destination

#### Phase D — i18n, tests, docs
- [x] en + ar keys for all of the above
- [x] Integration tests: pickup quote/choice, forced routing, ready-notify without auto-assign, code-gated pickup + COD cash + fee ledgers, handover/fail blocked
- [x] This file kept current

## 7. v1.22 — Hardening pass

Security review + throttling of the self-service money actions:

- **Rate limits** (in-memory limiter, per authenticated identity — not IP):
  `payCodWithWallet` 10/min per buyer, `setWalletCodHold` 10/min per
  courier, remit-claim submissions 6/10min per courier/point (the one-open-
  claim rule already exists; this stops submit→reject churn flooding the
  review queue). Staff actions stay unthrottled — they're role-gated and
  audited.
- **Race fixes**: `offsetEarningsAgainstCod` and `approveRemitClaim` now
  compute/check the courier or point cash INSIDE the transaction under a
  `SELECT … FOR UPDATE` row lock, so a concurrent hand-in or second offset
  can never overdraw what the holder actually still owes.
- Audit sweep of the v1.14–v1.21 surface confirmed: every action is
  role-gated against the DB (never the JWT), all money writes are
  conditional flips or guarded decrements, buyer-facing reads are scoped by
  ownership, and free-text inputs are length-capped and rendered escaped.

### Build checklist (v1.22)

- [x] Rate limits on pay-cod / wallet-hold / remit-claim submissions + `tooMany` i18n (en + ar)
- [x] Row-locked in-transaction cash re-checks in offset + claim approval
- [x] Integration tests: limiter wiring on both throttled self-service paths
- [x] This file kept current

## 8. Out of scope

## 8. v1.2 — Point capacity & smart selection

Keeps small shops from being buried in parcels and puts the *right* point
first in every picker. Each point gets an optional **capacity** (max parcels
held at once; empty = unlimited). Capacity gates **new routing only** — a
parcel already announced to a point is always accepted at the counter, so a
scan at the desk never bounces; ops fix overload by raising capacity or
suspending the point.

Rules:

- **Load** = parcels currently held or inbound (`LABEL_CREATED`, `AT_POINT`,
  `RETURNED_TO_POINT`) on in-flight sub-orders.
- A point is **full** when load ≥ capacity. Full points disappear from the
  checkout picker and the seller drop-off picker, and `placeOrder` /
  `shipSubOrder` re-validate server-side (client lists are never trusted).
- **Ordering**: pickers list points in the buyer's destination governorate
  first, least-loaded first within a governorate (the checkout picker
  re-sorts live when the buyer switches address).
- Admins set capacity on the point detail page; the operator sees their own
  load vs capacity on the dashboard.

### Build checklist (v1.2)

- [x] Schema: `DeliveryPoint.capacity Int?` + migration
- [x] `lib/point-select.ts`: load counting, full-point filtering, governorate-first ordering (shared by checkout, seller page, validation)
- [x] `placeOrder` + `shipSubOrder`: reject routing to a full point (`pointFull`); forced PICKUP routes stay valid
- [x] Checkout picker: nearest-first per selected address, full points excluded
- [x] Seller drop-off picker: same ordering by the order's destination
- [x] Admin point detail: capacity editor; network list shows load/capacity
- [x] Point dashboard: load vs capacity header
- [x] i18n (en + ar) + integration tests (full-point rejection, ordering, unlimited default, forced-pickup exemption)
- [x] This file kept current

## 10. v1.3 — Automatic resolution & refunds on RTS

Until now a return-to-seller left the sub-order stuck at SHIPPED for ops to
untangle. Now the RTS scan settles everything in one step, through the same
shared refund core (`lib/refunds.ts`) the admin and returns flows use:

- **Prepaid & captured** (non-COD payment CONFIRMED): full refund credited to
  the buyer's HezalliPay wallet, sub-order → REFUNDED, seller ledger
  reversed, buyer notified — all via `applyRefund`.
- **Nothing captured** (COD, or prepaid not yet confirmed): sub-order →
  CANCELLED with an order-history entry and a buyer notice; no money moves.
- **Both paths restock** the returned items (the goods are back with the
  seller) and keep the seller's collect-from-point notification.

### Build checklist (v1.3)

- [x] `lib/point-core.ts`: `returnParcelToSeller` resolves the sub-order (refund via `applyRefund` / cancel), restocks items, records order history
- [x] Buyer notified of the outcome (refund notice comes from the refund core; cancel path sends its own)
- [x] i18n (en + ar) for the cancel notice
- [x] Integration tests: COD RTS → CANCELLED + restock, wallet-paid RTS → REFUNDED + wallet credit + restock, RTS still blocked before attempts are exhausted
- [x] This file kept current

## 12. v1.4 — Driver COD remittance via points

Drivers no longer need to travel to Hezalli's office to hand in COD cash:
the counter of any active point can take it. One operator action moves the
money between the two ledgers atomically:

- Courier ledger: `REMITTANCE` (−amount, recorded by the point operator,
  note names the point) — the driver's cash-on-hand drops immediately.
- Point ledger (cash side): new `DRIVER_CASH_IN` (+amount) — the point now
  holds that cash for Hezalli alongside its counter-pickup COD, settled by
  the same admin `COD_REMITTANCE` flow.
- Guard: the amount may not exceed the driver's current cash-on-hand
  (`overRemit`), and only active couriers qualify. The driver is notified.

### Build checklist (v1.4)

- [x] `PointLedgerType.DRIVER_CASH_IN` + migration; cash-side sums updated (`pointLedgerSummary`)
- [x] Action `pointDriverCashIn(driverId, amount, note?)` — atomic double entry + audit + driver notification
- [x] Point ledger page: cash-in form (driver picker + amount)
- [x] Labels in point + admin ledgers; i18n (en + ar)
- [x] Integration tests: cash-in moves both ledgers, over-remit rejected, non-courier rejected
- [x] Tidy: unused `ownerId` lint warning in `point-capacity.test.ts`
- [x] This file kept current

## 14. v1.5 — Inter-point line-haul (two-hop routing)

A seller in Sanaa serving a buyer in Aden no longer needs to reach the Aden
point themselves: they drop the parcel at an **origin point** near them, a
courier carries it city-to-city, and the **destination point** runs the last
mile (driver delivery or buyer pickup) exactly as before. Reuses existing
statuses — no enum churn:

```
Seller ships: origin point (near seller, optional) + destination point
        ↓  LABEL_CREATED
Origin receives [scan]        →  AT_POINT   (at origin; no last-mile assign)
Origin hands to line-haul driver [scan]  →  IN_TRANSIT (custody: driver)
Destination receives [scan]   →  AT_POINT  (at destination; normal flow resumes:
                                  courier auto-assign, or ready-for-pickup)
```

Rules: the origin leg is only offered when origin ≠ destination; both scans
use the same receive/handover modes — the scanning point's role (origin vs
destination) decides the transition; the line-haul driver earns the normal
delivery fee only on final delivery (transfer legs are salaried line-haul
ops, no per-drop fee); both points earn their handling fee split? No — only
the destination point earns `point_handling_fee` on delivery (v1 keeps one
fee; origin compensation via `ADJUSTMENT` until a dedicated fee exists).

### Build checklist (v1.5)

- [x] `Shipment.originPointId` + migration; origin load counts toward the origin point's capacity
- [x] `point-core`: origin receive (`AT_POINT`, no auto-assign), transfer handover (→ `IN_TRANSIT`), destination receive (`IN_TRANSIT` → `AT_POINT`, auto-assign/ready)
- [x] Seller ship form: optional origin-point picker (sorted near the seller) when a destination point/pickup is set
- [x] Point dashboard: transfer parcels visible at both ends (inbound / outbound)
- [x] i18n (en + ar) + integration tests (two-hop happy path incl. pickup orders, wrong-point scans rejected, capacity counts origin leg)
- [x] This file kept current

## 16. v1.6 — Origin transfer fee & stale-parcel visibility

Two finishing touches for a healthy network:

1. **Origin hubs get paid.** A two-hop parcel now credits BOTH ledgers when
   it is finally delivered: the destination point earns `point_handling_fee`
   as before, and the origin point earns the new `point_transfer_fee`
   (default 0.25 USD) — recorded in the same delivery transaction, labelled
   as a transfer leg. No more unpaid work at entry hubs.
2. **Stuck parcels become visible.** A parcel that hasn't moved for
   `stale_parcel_days` (default 3) shows an aged badge ("5d") on the point
   dashboard, and the admin network list shows a red stale-count chip per
   point, so ops can chase the exact hub that's sitting on parcels.

### Build checklist (v1.6)

- [x] Settings: `point_transfer_fee` (default 0.25), `stale_parcel_days` (default 3) + admin form fields
- [x] `shipment-core`: credit the origin point's transfer fee on DELIVERED (same tx as the handling fee)
- [x] Point dashboard: days-held age chip per parcel, amber past the threshold
- [x] Admin points list: stale-parcel count chip per point
- [x] i18n (en + ar) + integration test (two-hop delivery credits both ledgers; single-hop credits one)
- [x] This file kept current

## 18. v1.7 — Delivery network analytics

The admin Reports page (date-ranged) gains a **Delivery network** section so
ops can see how the network performs, not just what it owes:

- Headlines for the selected range: parcels shipped, delivered, failed
  attempts, returned-to-seller, **success rate** (delivered vs RTS), average
  ship→deliver time, and the pickup share of deliveries.
- A per-hub table (top by volume): delivered parcels and fees earned in the
  range — the same numbers a hub's operator sees on their own ledger.

### Build checklist (v1.7)

- [x] `lib/point-stats.ts`: `networkSummary(from, to)` — aggregates over shipments, attempts, events, and the point ledger
- [x] Reports page: Delivery network section reusing the existing date range
- [x] i18n (en + ar)
- [x] Integration test: a delivered + an RTS parcel in range produce the expected headline numbers and per-hub rows
- [x] This file kept current

## 20. v1.8 — Pickup window & stale-parcel sweep

v1.6 made stuck parcels *visible*; v1.8 makes the network *act* on them,
the way Shopee/Lazada PUDO networks do. Notifications only — no automatic
money movement: the operator's RTS scan (§10) stays the single human-verified
trigger for refunds/cancellation, so the sweep can never move cash on its own.

1. **Pickup window.** New setting `pickup_window_days` (default 7): how long
   a PUDO parcel waits at the counter before it should go back to the seller.
2. **Buyer reminder.** A pickup parcel sitting `stale_parcel_days` without
   being collected reminds the buyer once ("your parcel is waiting at
   <hub>").
3. **Window expiry.** Past `pickup_window_days`, the buyer is told the window
   lapsed and the point operator + seller are prompted to run the normal RTS
   scan — which already resolves money (refund / cancel / restock, §10).
4. **Stuck courier parcels.** A courier-routed parcel held at a hub past
   `stale_parcel_days` notifies the operator once to move it.

Mechanics: staleness = `Shipment.updatedAt` age (same signal as the v1.6
badges). One-shot guards are two new nullable timestamps on `Shipment`
(`pickupRemindedAt`, `staleFlaggedAt`) so re-running the sweep is harmless.
Runs from a new `CRON_SECRET`-protected endpoint `/api/cron/points`,
alongside the existing auto-complete/marketing crons.

### Build checklist (v1.8)

- [x] Setting `pickup_window_days` (default 7) + admin form field
- [x] Migration: `Shipment.pickupRemindedAt` / `staleFlaggedAt` (nullable timestamps)
- [x] `lib/point-sweep.ts`: `sweepPointParcels()` → `{reminded, expired, flagged}` with one-shot guards
- [x] `/api/cron/points` route (CRON_SECRET, GET+POST) running the sweep
- [x] i18n (en + ar) for the new notifications + settings label
- [x] Integration test: backdated parcels trigger reminder → expiry → operator flag exactly once; second sweep is a no-op
- [x] This file kept current

## 22. v1.9 — Point payout requests

Completes the "both win" money loop. Hubs earn handling/transfer fees on
their ledger, but getting paid is admin-initiated today — the operator has
no way to ask. v1.9 mirrors the seller payout flow for point operators:

1. **Operator requests.** On the hub's ledger page: request a payout of the
   free earnings balance (or a chosen amount). Guards mirror sellers':
   at least `min_payout_usd`, at most the free balance (earnings minus
   outstanding requests), computed under a row lock on the point so racing
   requests can't overdraw, and only one open request at a time.
2. **Admin resolves.** The admin hub page lists requests; marking one PAID
   flips it race-safely (conditional update) and writes the negative
   `PAYOUT` ledger entry in the same transaction — the request and the
   ledger can never disagree. Rejecting records a reason. Both notify the
   operator (ar/en) and are audit-logged.

Data: new `PointPayoutRequest` (pointId, amountUsd, status reusing
`PayoutStatus`, note, processedBy/At). Cash-side COD remittance stays a
manual admin entry (§12) — this flow only pays out the earnings side.

### Build checklist (v1.9)

- [x] `PointPayoutRequest` model + migration (status reuses `PayoutStatus`)
- [x] `lib/actions/point-payout.ts`: `requestPointPayout` (locked free-balance check, one open request), `markPointPayoutPaid` (flip + PAYOUT ledger row in one tx), `rejectPointPayout`
- [x] Point ledger page: free balance, request form, request history
- [x] Admin hub page: pending requests with pay (reference) / reject (reason)
- [x] i18n (en + ar) + notifications to the operator
- [x] Integration test: below-min / over-balance / double request rejected; pay writes exactly one ledger row and can't double-pay; reject has no ledger effect
- [x] This file kept current

## 24. v1.10 — Buyer-facing network visibility

The network works, but buyers can't _see_ it. Two public-facing pieces:

1. **Pickup card on the public track page.** A pickup parcel held at a hub
   (`AT_POINT` + `PICKUP`) shows a "ready for collection" card: hub name,
   address, phone, and a reminder to bring the delivery code — instead of a
   courier delivery estimate that doesn't apply. Privacy-safe: the hub is a
   public business location; no buyer data is added.
2. **Public points directory** at `/points` (shop layout): ACTIVE hubs
   grouped by governorate with name, city, address, and phone, plus a
   "become a Hezalli Point" link to the existing `/point-partner` page.
   Linked from the checkout pickup picker ("see all points"). Grows both
   sides of the marketplace: buyers discover pickup, partners discover the
   program.

### Build checklist (v1.10)

- [x] `lib/point-public.ts`: `publicPointsByGovernorate()` (ACTIVE only) + `heldAtPoint(shipment)` hub lookup for the track page
- [x] Track page: pickup-ready card (hub name / address / phone + bring-your-code hint); no courier ETA for pickup parcels
- [x] `/points` public directory page + link from checkout picker
- [x] i18n (en + ar) + SEO metadata for `/points`
- [x] Integration test: directory lists only ACTIVE hubs grouped by governorate; held pickup parcel resolves its hub info
- [x] This file kept current

## 26. v1.11 — Driver collection manifest

Closes the last gap to the original vision (§1): _"the driver shows their
collecting QR, the point sees the orders assigned to them and hands them
over"_. Today the counter scans the driver's QR to pick the driver but still
scans every parcel label one by one. v1.11 adds the batch:

1. **Manifest.** Scanning a driver's QR (or picking them) shows every parcel
   at THIS hub assigned to that driver — tracking, destination city, COD
   badge — the driver's pickup list, exactly like big-carrier manifests.
2. **Hand over all.** One tap hands the whole manifest to the driver. Under
   the hood each parcel still goes through the same race-guarded
   `handoverParcelToDriver` transition (events, custody stamps, mismatch
   guards) — the batch is a loop, not a new money/custody path. Per-parcel
   scanning stays available for partial collections.
3. **Result feedback.** The counter sees "N handed, M failed" — a parcel
   grabbed by a concurrent scan just drops out of the batch.

### Build checklist (v1.11)

- [x] `point-core`: `driverManifestAtPoint(pointId, driverId)` (held, assigned, last-mile only) + `handoverManifestToDriver` batch loop
- [x] Actions: `pointDriverManifest` / `pointHandoverManifest` (operator-gated)
- [x] Scan station: manifest panel when a driver is selected (list + "hand over all (N)"), per-parcel scan unchanged
- [x] i18n (en + ar)
- [x] Integration test: manifest lists only this hub's assigned last-mile parcels; batch hands all; concurrent claim drops out; pickup parcels never appear
- [x] This file kept current

## 28. v1.12 — Hub monthly statement

What every real partner network mails its hubs: a monthly statement.
Operators see their ledger as a running list today, but reconciling a month
("what did I earn, what was I paid, how much cash did I owe?") means adding
rows by hand. v1.12 gives them the accounting view:

1. **Statement page** (`/point/statement?month=YYYY-MM`, prev/next nav):
   for the chosen month, BOTH sides of the hub's books —
   - _Earnings_: opening balance → fees earned, payouts, adjustments →
     closing balance.
   - _COD cash_: opening balance → counter COD taken, driver cash-in,
     remittances → closing balance.
   - The full entry list for the month underneath.
2. **CSV export**: a `text/csv` download of the month's entries (date, type,
   note, amount) from an operator-gated route — for spreadsheets, audits, or
   the accountant.

Math note: opening = signed sum of all entries strictly before the month;
closing = opening + the month's delta. Because every ledger row is signed
and immutable, both are pure SUMs — nothing stored, nothing to drift.

### Build checklist (v1.12)

- [x] `lib/point-statement.ts`: `pointStatement(pointId, from, to)` — opening/delta/closing per side + per-type totals + entries
- [x] `/point/statement` page: month nav, both summaries, entry list, CSV link
- [x] `/api/point/statement` CSV route (operator-gated)
- [x] Link from the point ledger page
- [x] i18n (en + ar)
- [x] Integration test: seeded two-month ledger → opening excludes the month, closing = opening + delta, both sides; CSV route gated
- [x] This file kept current

## 30. v1.13 — Courier ledger & monthly statement

The v1.12 statement, for the OTHER cash-handling role. Drivers see two
headline tiles (cash to remit, earnings) but not the entries behind them —
they can't answer "which parcels am I carrying cash for?" or reconcile a
month the way hubs now can.

1. **Driver ledger page** (`/driver/ledger`): the same headline tiles plus
   the recent entry list (COD collected per drop, remittances, delivery-fee
   earnings, payouts, adjustments).
2. **Driver monthly statement** (`/driver/statement?month=YYYY-MM`):
   opening → month's activity → closing for both sides — _earnings_
   (EARNING / PAYOUT / ADJUSTMENT) and _COD cash_ (COD_COLLECTED /
   REMITTANCE) — plus a CSV export, reusing v1.12's `monthRange` /
   `statementCsv` and the same pure-SUM math over the immutable
   `CourierLedgerEntry` table.
3. Linked from the driver home's cash tiles. Gated by `requireCourierId`.

### Build checklist (v1.13)

- [x] `lib/courier-statement.ts`: `courierStatement(courierId, from, to)` (reuses v1.12 helpers)
- [x] `/driver/ledger` page: tiles + recent entries
- [x] `/driver/statement` page + `/api/driver/statement` CSV route (courier-gated)
- [x] Links from the driver home
- [x] i18n (en + ar)
- [x] Integration test: seeded two-month courier ledger → opening/delta/closing both sides; out-of-range entries absent
- [x] This file kept current

## 32. v1.14 — COD credit control

The standard playbook of Shopee/J&T/Lazada, adapted: **nobody may hold more
of Hezalli's cash than the future income they'd lose by keeping it.** A
driver's future income is new assignments and accrued delivery fees; a
point's is parcel flow and handling-fee payouts. All rules are pure reads
over the existing immutable ledgers (`lib/cod-guard.ts`) — no new tables.

Three platform settings (Admin → Settings; 0 turns a check off):

| Key | Default | Meaning |
| --- | --- | --- |
| `driver_cash_limit` | `50` | USD of unremitted COD a driver may hold before auto-assignment skips them. |
| `driver_cod_max_age_hours` | `24` | How long a driver may sit on ANY collected COD. Remittances settle the oldest cash first (FIFO), so partial hand-ins don't reset the clock. |
| `point_cash_limit` | `200` | USD of unremitted cash (counter COD + driver cash-ins) a point may hold before it stops receiving new routing and driver cash-ins. |

Rules:

- **Driver assignment gate** — `courier-assign` filters blocked drivers out
  of every automatic pick (auto/bulk/nearest). Manual dispatch still works —
  ops can override. The driver home shows a red "new deliveries paused"
  banner with the reason and the fix (hand cash in at any point / office),
  and an amber warning from 80% of the cash limit.
- **Earnings are collateral** — `recordEarningsPayout` refuses while the
  driver holds any COD cash; the admin courier page gains a one-click
  "Settle COD from earnings" offset: one atomic double entry
  (REMITTANCE −m, PAYOUT −m, m = min(cash held, earnings owed)) — the
  industry-standard shortage-from-wages netting, no cash moves.
- **Point routing gate** — `point-select` treats an over-limit point as
  unavailable for NEW routing (picker + server re-check); committed parcels
  and buyer pickups are unaffected. `pointDriverCashIn` refuses at an
  over-limit hub so more of Hezalli's cash can't concentrate there.
- **Point payout withholding** — `requestPointPayout` nets held cash out of
  the payable balance: a hub sitting on $20 of cash can only draw
  fees − $20 until it remits (`cashOutstanding` error explains why).

### Build checklist (v1.14)

- [x] Settings: `driver_cash_limit`, `driver_cod_max_age_hours`, `point_cash_limit` + admin form fields
- [x] `lib/cod-guard.ts`: bulk + single courier checks (FIFO age), bulk point check
- [x] `courier-assign`: blocked drivers excluded from automatic assignment
- [x] Driver home: blocked banner (reason-specific) + near-limit warning
- [x] Admin courier page: blocked badge, offset form; payout guarded by `cashOutstanding`
- [x] `point-select`: over-limit points unroutable; `pointDriverCashIn` refuses (`cashLimit`)
- [x] `requestPointPayout`: held cash withheld from the free balance
- [x] i18n (en + ar) + integration tests (`cod-guard.test.ts`)
- [x] This file kept current

## 34. v1.15 — Security deposits & trust-based limits

v1.14's flat cash limits become **per-holder credit**. A deposit is optional
— it's one of three ways a holder earns headroom, and history is another, so
a driver with no money to deposit still grows a limit by delivering well:

```
driver limit = driver_cash_limit                     (base, everyone)
             + security deposit                      (admin-recorded, 1:1)
             + trust bonus                           (from delivery history)
point limit  = point_cash_limit + point deposit      (1:1)
```

The trust bonus: every `trust_step_deliveries` completed deliveries
(EARNING ledger rows) add `trust_step_bonus_usd`, capped at
`trust_bonus_cap_usd` — defaults 20 / $10 / $100, so a driver with 200
clean deliveries carries base + $100 with no deposit at all. The AGE limit
stays fixed for everyone: trusted or not, cash must not sit overnight.

Deposits are plain fields (`User.courierDepositUsd`,
`DeliveryPoint.depositUsd`), not ledger rows — the cash lives outside the
system (office safe / bank), like payout references. Admin-set only via
`lib/actions/deposit.ts` (audited `courier.deposit` / `point.deposit`,
holder notified). Zero is valid; the amount REPLACES the stored balance.

UI: the admin courier page shows the full breakdown (base + deposit +
trust = personal limit) beside the deposit form; the admin point page the
same; the driver home cash tile shows "your cash limit: $X — it grows with
every delivery" so the incentive is visible.

### Build checklist (v1.15)

- [x] Schema + migration: `User.courierDepositUsd`, `DeliveryPoint.depositUsd` (Decimal, default 0)
- [x] Settings: `trust_step_deliveries`, `trust_step_bonus_usd`, `trust_bonus_cap_usd` + admin form fields
- [x] `lib/cod-guard.ts`: effective per-holder limits (deposit 1:1 + capped trust bonus); status exposes the breakdown
- [x] `lib/actions/deposit.ts`: `setCourierDeposit` / `setPointDeposit` (admin-only, audited, notified)
- [x] Admin courier + point pages: deposit form & limit breakdown
- [x] Driver home: personal limit line on the cash tile
- [x] i18n (en + ar) + integration tests (deposit unblocks, trust steps, point deposit, guards)
- [x] This file kept current

## 36. v1.16 — Wallet COD hold (pledged collateral)

The third leg of the credit limit: a courier voluntarily locks part of
their HezalliPay balance as collateral (`Wallet.codHoldUsd`) — no money
moves, it just stops being spendable, and the limit rises by
`min(codHoldUsd, availableUsd)` (an unbacked pledge is worth nothing, which
also makes any race between a pledge and a concurrent spend harmless).

```
driver limit = base + deposit + wallet hold + trust bonus
```

Rules:

- **Pledge is self-service** (`lib/actions/wallet-hold.ts`, driver ledger
  page): raising it only needs the balance to cover the new hold (guarded
  conditional update). **Releasing it requires empty pockets** — while the
  driver holds any COD cash the pledge is locked, so the collateral can't
  vanish exactly when it matters. Audited (`courier.walletHold`).
- **Held money can't leave.** All four wallet outflow paths (withdrawal,
  P2P/pay-user transfer, bill/airtime, pay-order-with-balance) now require
  `availableUsd ≥ amount + codHoldUsd` in both the pre-check and the atomic
  debit guard.
- The admin courier page breakdown and the driver ledger card show the
  pledge; the driver sees balance / pledged / resulting limit in one line.

### Build checklist (v1.16)

- [x] Schema + migration: `Wallet.codHoldUsd` (Decimal, default 0)
- [x] Outflow guards respect the hold: withdrawal, transfers, bills, order pay-with-balance
- [x] `lib/cod-guard.ts`: effective collateral = min(hold, balance) added to the driver limit
- [x] `lib/actions/wallet-hold.ts`: self-service pledge (raise = balance-guarded; release = only with no COD cash)
- [x] Driver ledger: pledge card; admin courier page: hold in the limit breakdown
- [x] i18n (en + ar) + integration tests (pledge raises limit, unfunded pledge rejected, pledged money can't transfer out, release requires empty pockets)
- [x] This file kept current

## 38. v1.18 — Digital COD remittance

The Yemeni version of "deposit at the bank machine and upload the slip":
instead of traveling to hand cash in, a courier or point transfers it over a
rail (Jawali / Jaib / Floosak / Kuraimi / bank) and files a claim with the
transfer reference. Mirrors the wallet top-up manual-confirm flow.

```
Driver/Point: sends money over a rail (outside the system)
      ↓  files claim: amount + rail + reference     (RemitClaim PENDING)
Delivery manager: sees it in /delivery-manager/remittances,
checks the rail account, money arrived?
   ├─ Approve → courier REMITTANCE / point COD_REMITTANCE written in the
   │            same transaction; claimant notified; ledger settles
   └─ Reject (reason) → nothing moves; claimant still owes the cash
```

Rules:

- **Nothing moves before verification.** A PENDING claim reserves nothing —
  the sender still holds the cash on their ledger (and stays blocked if
  over a limit) until staff confirm the money actually arrived.
- **One open claim per sender**; amount capped by cash on hand at filing
  AND re-checked at approval (the cash may have been settled another way
  in between — an over-claim is refused, reject and re-file).
- The approve flip is conditional (PENDING → APPROVED once), so a
  double-click can't settle twice. Audited both ways; the claimant is
  notified with the decision.

### Build checklist (v1.18)

- [x] `RemitClaim` model + `RemitClaimStatus` enum + migration
- [x] `lib/actions/remit-claim.ts`: submit (courier/point, guarded) + approve/reject (delivery manager; approve writes the ledger row atomically)
- [x] Driver ledger + point ledger: "remit by transfer" card with rail picker + reference; pending claim shown while it waits
- [x] `/delivery-manager/remittances`: pending queue (approve/reject with reason) + recent decisions; nav item
- [x] i18n (en + ar) + integration tests (full courier flow incl. double-approve guard, stale-claim re-check, point flow)
- [x] This file kept current

## 39. v1.19 — Doorstep wallet payment for COD

The endgame of COD risk control (Amazon "COD by UPI", Shopee/Lazada
wallet-at-door): the buyer settles a cash-on-delivery order from their
HezalliPay balance BEFORE handover, so the driver or pickup counter
collects nothing — no cash ever exists to steal, lose, or remit.

The order keeps `paymentMethod: COD`; what flips is the Payment row →
CONFIRMED (`confirmedBy: "buyer:wallet"`). Every downstream money path
already keys off that, so a paid order delivers exactly like a prepaid one:

- `markSubOrderDelivered` charges `codAmount` only while the payment is
  unconfirmed → no `COD_COLLECTED` lands on the courier (delivery fee still
  accrues), no counter COD on a pickup point.
- `buyerPickupAtPoint` returns `codDue: 0` → the counter shows nothing to
  collect.
- The driver job page swaps the amber "collect cash" callout for a green
  "PAID digitally — collect NO cash", and every assigned driver still on
  the road is notified the moment the buyer pays.

Rules (`lib/actions/pay-cod.ts`):

- Payable only while EVERY sub-order is still PENDING/CONFIRMED/
  PROCESSING/SHIPPED — once anything is delivered (cash may have changed
  hands), cancelled, or returned, the remaining amount is ambiguous and the
  order settles in cash as usual.
- Atomic wallet debit with the standard guards (frozen, COD hold not
  spendable, conditional decrement) + a conditional Payment flip so a
  double-tap racing a doorstep delivery can never charge twice.
- Buyer order page: a "Pay now — skip the cash" card with the wallet
  balance; disabled with a top-up hint when the balance can't cover it.
- **Admin kill switch**: `cod_wallet_pay_enabled` (Admin → Settings, on by
  default) hides the pay card and blocks the action platform-wide; orders
  already paid stay paid.

### Build checklist (v1.19)

- [x] `payCodWithWallet`: guards + atomic debit + conditional Payment flip + history + driver notifications
- [x] `shipment-core` / `point-core`: cash due only while the payment is unconfirmed
- [x] Driver job page: green "paid digitally" callout replaces the collect-cash banner
- [x] Buyer order page: pay-from-wallet card (balance-aware) + paid notice
- [x] i18n (en + ar) + integration tests (pay → deliver with zero cash accountability, double-pay guard, insufficient, delivered/foreign order refused)
- [x] This file kept current

## 40. v1.21 — Cash exposure dashboard

One screen for the owner's daily question: **"how much of Hezalli's money
is in other people's pockets right now?"** `codExposureReport()` in
`lib/cod-guard.ts` (a handful of grouped queries, FIFO aging identical to
the block rule) powers `/admin/cash` and `/delivery-manager/cash`:

- Headline tiles: total outstanding, drivers vs points split, blocked
  counts, and collateral coverage (deposits + effective wallet pledges vs
  cash out there).
- An aging bar: green under 24h, amber 24–48h, red over 48h — red means
  pick up the phone.
- Top-holder tables (drivers and points) with cash, personal limit,
  collateral, overdue amounts, and a status chip, each row linking to the
  courier/point console.

### Build checklist (v1.21)

- [x] `codExposureReport()` — totals, FIFO aging buckets, collateral coverage, top holders, blocked flags
- [x] Shared `CashExposureView` + routes under /admin and /delivery-manager; nav items
- [x] i18n (en + ar) + integration test (aging bands, collateral, blocked flags, totals)
- [x] This file kept current

## 41. v1.23 — Shelf/bin locations inside the hub

The system knew WHO holds a parcel but not WHERE it sits inside the shop —
retrieving one meant searching the shelves. Standard PUDO fix (Amazon Hub,
InPost): a free-text shelf/bin label stamped at the receive scan.

- **Stamp at receive.** The scan station's Receive and Return modes gain an
  optional "shelf / bin" input (sticky between scans, so a stack going onto
  one shelf is typed once). Free text ("A3") — each shop labels its own
  shelves; no shelf inventory model.
- **Shown at retrieval.** The driver manifest (scan the driver's QR → their
  pickup list) shows each parcel's shelf chip; the buyer-pickup scan result
  leads with "Shelf A3 — collect $X"; the dashboard shows the chip on every
  held parcel.
- **Re-shelve.** Scanning a parcel the hub already holds in Receive mode
  with a shelf entered just moves the label (no custody change, no events);
  without a shelf it stays the usual `badState`.
- **Cleared on every departure** — driver handover, buyer pickup/delivery,
  RTS — so a freed shelf label never lies.

### Build checklist (v1.23)

- [x] Schema: `Shipment.shelfCode String?` + migration
- [x] `point-core`: receive/return stamp the shelf (trimmed, ≤20 chars), re-shelve path, cleared on handover / delivery / RTS; `ManifestRow.shelf`; pickup result returns the shelf
- [x] Scan station: sticky shelf input (Receive/Return), manifest shelf chips, shelf-first pickup feedback
- [x] Point dashboard: shelf chip on held parcels
- [x] i18n (en + ar) + integration tests (stamp→manifest→clear, re-shelve, pickup shows & clears, failed-return re-stamp)
- [x] This file kept current

## 42. v1.24 — Operator app completeness

The backend outgrew the operator's app: hubs had four screens while drivers
had nine, and several things the platform already enforced (the cash limit,
the pickup window, sweep notifications) were invisible at the counter. This
pass closes the gap — UI + read paths only, no new money flows:

1. **History** (`/point/history`): parcels that finished their journey
   through the hub (DELIVERED / RETURNED, either end of a two-hop), with the
   fee each booked on this hub's ledger. The dashboard only shows in-flight
   parcels, and the scan trail is the custody evidence (§4) — operators need
   to look back.
2. **Parcel search & detail** (`/point/parcel/[code]`): resolve a tracking
   number or shipment id (scoped to parcels involving this hub) to a detail
   page — route, badges, delivery attempts, and the full scan-event
   timeline. Dashboard and history rows link to it; a search box sits on
   both pages.
3. **Cash-limit banner**: the dashboard now shows the driver-style red
   "new parcels paused" banner when held cash exceeds
   `point_cash_limit + deposit`, and an amber warning from 80% — instead of
   the operator discovering the block when a cash-in fails.
4. **Pickup countdown**: counter-pickup parcels get their own dashboard
   group with a days-left chip against `pickup_window_days` (amber ≤ 2 days,
   red when expired) so the operator can act before the sweep does.
5. **Hub stats** (`/point/stats`): month-navigated scoreboard (delivered,
   counter pickups, RTS, fees, success rate, pickup share) + all-time
   totals, via `hubSummary()` in `lib/point-stats.ts` — the hub's slice of
   the admin Reports numbers.
6. **Notifications bell**: the point shell header gains the shared
   `NotificationBell` (new `point` variant routes shipment-id notices to the
   parcel detail page) — sweep alerts were previously unreachable from the
   app.
7. **How it works** (`/point/how`): the operator guide every other role
   already had, using the shared how-blocks.
8. **My hub** (`/point/profile`): read-only card of the public directory
   details, capacity, deposit, and the cash-limit breakdown.
9. **Tab bar**: History joins the primary tabs; Stats, Statement, My hub,
   and Guide live in the More sheet.

### Build checklist (v1.24)

- [x] `/point/history` + fee-per-parcel join; `/point/parcel/[code]` detail with events + attempts; `ParcelSearch` box
- [x] Dashboard: cash-limit banner (red/amber), pickup-wait group with window countdown, rows link to detail
- [x] `lib/point-stats.ts`: `hubSummary(pointId, from, to)`; `/point/stats` page with month nav
- [x] `NotificationBell` `point` variant + bell in the point layout header
- [x] `/point/how` + `/point/profile`; tab bar More sheet
- [x] i18n (en + ar)
- [x] This file kept current

## 42b. v1.25 — Counter polish

Rounding out the v1.24 app for real counter volume:

1. **Pagination** on `/point/history` and the ledger entry list (50 per
   page, newer/older links) — the fixed take-50 stops silently hiding the
   tail.
2. **End-of-day card** on the dashboard: received / handed over / cash
   taken / fees since midnight, via `hubDaySummary()` in
   `lib/point-stats.ts` (money from the hub-keyed ledger; parcel movements
   from the scan events the hub's own scans stamp).
3. **Buyer-name search**: the parcel search now also resolves the name a
   customer gives at the counter — a contains-match over this hub's parcels
   with a result list when it's ambiguous.

### Build checklist (v1.25)

- [x] History + ledger pagination (page param, one-row lookahead)
- [x] `hubDaySummary()` + dashboard today tiles + test
- [x] Buyer-name fallback on `/point/parcel/[code]` + widened search copy
- [x] i18n (en + ar)
- [x] This file kept current

## 42c. v1.26 — Hub vacation mode

A shop closes for Eid, a family trip, a renovation — until now the only
lever was an admin suspension. Now the operator pauses themselves
(`DeliveryPoint.pausedAt`, toggled from `/point/profile` via
`setPointPaused`, audited `point.pause`):

- **No NEW routing while paused** — the checkout pickup picker, the seller
  drop-off/origin pickers, and the server re-check (`point-select`) all
  treat a paused hub like a suspended one, and it disappears from the
  public `/points` directory.
- **The counter keeps working** — parcels already announced are still
  accepted at the desk, held parcels stay collectible (buyer pickups,
  driver manifests), and committed PICKUP orders still ship to the hub:
  exactly the capacity-gate exemptions, reused.
- **Visible everywhere it matters** — an amber banner on the hub dashboard
  (linking to the resume switch), the loud/quiet toggle card on the profile
  page, and an "on break" chip on the admin/delivery-manager network list.
  Only the operator can lift their own pause; admin suspension remains a
  separate, staff-owned lever.

### Build checklist (v1.26)

- [x] `DeliveryPoint.pausedAt` + migration
- [x] `point-select` (picker + server re-check) and `point-public`
      (directory) exclude paused hubs; pickup-hub card on the track page
      unaffected (the parcel is already there)
- [x] `setPointPaused` (operator-gated, audited) + profile toggle +
      dashboard banner + admin list chip
- [x] i18n (en + ar) + integration test (`point-pause.test.ts`: pause →
      unroutable + hidden, committed pickup still ships and scans, resume
      restores, non-operator refused)
- [x] This file kept current

## 42d. v1.27 — Point staff (multi-account hubs)

A real hub is not one person: the shop has a store manager, a cashier, a
money collector, a shelves organizer. Until now they all shared the owner's
login — no accountability and full money access for whoever held the phone.
Now the owner attaches EXISTING Hezalli accounts to the hub as employees
(`PointStaff`: `userId` unique — one hub per person — with a
`PointStaffRole` job and an `isActive` off-switch):

- **Membership is the grant** — staff never receive the `DELIVERY_POINT`
  role. `requireDeliveryPoint()` admits the owner of an ACTIVE point OR an
  active `PointStaff` member of one, and reports the caller's tier
  (`access: OWNER | MANAGER | CASHIER | COLLECTOR | ORGANIZER`) so every
  action and page scopes what the job may do (`lib/point-access.ts`).
- **Job tiers** — every tier works parcels (receive, shelve, hand over,
  returns). Cash at the counter (buyer COD pickups, driver hand-ins) is
  everyone but the ORGANIZER. Money views (ledger, statement, stats, remit
  claims) are OWNER/MANAGER/COLLECTOR. Team + vacation mode are
  OWNER/MANAGER. Payout requests and earnings→wallet moves stay OWNER-only —
  both pay the owner, so an employee triggering one would move the hub's
  earnings into their own pocket.
- **The team screen** (`/point/staff`, owner/manager) — hire by phone or
  email (the same identifier rule as wallet P2P; no invite flow, the
  employee registers a normal account first), change jobs, pause a member
  (row kept, access revoked), or remove them. All writes audited
  (`point.staffAdd/Role/Activate/Deactivate/Remove`); the hire notifies the
  employee in their locale. Managers can't touch their own row, hub owners
  can't be hired elsewhere, and the roster is capped at 20.
- **The shell follows the tier** — the tab bar hides money tabs from
  cashiers/organizers and the team tab from non-managers; the profile page
  hides the pause toggle and cash-limit figures the same way. The server
  re-gates everything regardless.

### Build checklist (v1.27)

- [x] `PointStaffRole` + `PointStaff` + migration
- [x] `requireDeliveryPoint()` admits staff and reports the access tier;
      capability rules shared client/server in `lib/point-access.ts`
- [x] Money actions gated: COD pickup + driver cash-in (cash tiers), remit
      claims (money-view tiers), pause (owner/manager), payout request +
      earnings→wallet (owner only)
- [x] Money pages + statement CSV export gated to money-view tiers
- [x] `/point/staff` roster + hire/role/pause/remove actions (audited,
      notified, self-row and owner-poaching refused)
- [x] i18n (en + ar) + integration test (`point-staff.test.ts`: hire by
      phone/email, guards, tier scoping per action, pause revokes access,
      removal keeps the account, strangers refused)
- [x] This file kept current

## 43. Out of scope

- Three-plus-hop routing / regional sort hubs
