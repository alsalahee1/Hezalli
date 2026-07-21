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

## 7. Out of scope

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

## 17. Out of scope

- Three-plus-hop routing / regional sort hubs
