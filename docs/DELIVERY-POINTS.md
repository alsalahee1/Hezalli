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
- [ ] Layout + tab bar (Parcels · Scan · Ledger), role-guarded like `/driver`
- [ ] Dashboard: parcels grouped by state (awaiting drop-off, at point, out with drivers, returned) + redelivery dates
- [ ] Scan page: camera QR scanner with mode picker (Receive / Handover / Return) + manual tracking entry; handover mode accepts a driver-QR scan to filter the manifest
- [ ] Ledger page: balance + entries

### Phase 5 — Driver / seller / buyer touchpoints
- [ ] Driver page: "My collection QR" card; job page shows pickup point; delivered dialog gets optional delivery-code field
- [ ] Seller ship dialog: optional point selector (active points, platform carrier only)
- [ ] Buyer order page: delivery QR + code while out for delivery; reschedule form after a failed attempt
- [ ] Public tracking timeline: labels for the two new statuses

### Phase 6 — Admin
- [ ] `/admin/points`: list points (status toggle), review applications, ledger with payout/adjustment recording
- [x] Settings page: the three new keys editable

### Phase 7 — i18n, tests, docs
- [ ] `messages/en.json` + `messages/ar.json`: `Point`, `AdminPoints` namespaces + Driver/Orders/SellerOrders additions
- [ ] Integration tests: application approval, receive→handover→deliver (fee ledger), fail→return→reschedule→re-handover, RTS after max attempts, authz guards
- [ ] `docs/EXPRESS-DELIVERY.md` cross-link + this file kept current

## 6. Out of scope (v1)

- Inter-point line haul (multi-hop routing between cities)
- Point cash handling / COD remittance via points
- Automatic refunds on RTS
- Capacity limits & auto-selection of the best point
- Buyer pickup-from-point (PUDO as delivery destination)
