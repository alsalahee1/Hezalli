# Hezalli — Operational Lifecycle Gap Audit (2026-07-22)

Scope: **"what happens when nobody acts."** The 2026-07-20 audit reviewed code
correctness (races, indexes, performance, tests) and explicitly did not ask
this question. This audit walks every order/parcel state and checks whether the
platform recovers **automatically** when a human — buyer, seller, driver, point,
admin — does nothing, does it late, or refuses. That is the standard Amazon /
Shopee / Lazada / Noon operate to: every state has a clock, and every clock has
an automatic consequence.

Method: traced every state in `OrderStatus` / `SubOrderStatus` /
`ShipmentStatus` through the actions in `lib/actions/*` and the scheduled
sweeps (`vercel.json` crons → `lib/*-sweep.ts`, `expireStaleOrders`,
`autoCompleteDeliveredOrders`, `autoApproveReturns`, `remindAbandonedCarts`).

---

## 1. What is already covered (verified)

These lifecycle timers exist, run on cron, and were verified in source:

| # | Stage | If nobody acts… | Mechanism |
|---|-------|-----------------|-----------|
| 1 | Prepaid order placed, buyer never pays | Auto-cancelled after TTL, stock + flash claims + loyalty restored, buyer notified. Orders with payment proof under admin review are protected. | `expireStaleOrders` (`lib/actions/payment.ts`), hourly cron + lazy on page load |
| 2 | Parcel delivered, buyer never confirms | Order auto-completes after `auto_complete_days`, money settles to seller | `autoCompleteDeliveredOrders`, hourly cron |
| 3 | Seller ignores a return request | Auto-approved after `return_response_days` | `autoApproveReturns`, hourly cron |
| 4 | Parcel sits un-moved anywhere in the network | Flagged after 7 days, DELIVERY_MANAGER + ADMIN alerted (one-shot guard) | `sweepStuckShipments`, 6-hourly cron |
| 5 | PUDO parcel waits at a point | Buyer reminded, pickup window (`pickup_window_days`) lapse flagged, RTS prompted | `sweepPointParcels`, cron |
| 6 | Buyer not home at the doorstep | `DeliveryAttempt` recorded with reason; after `max_delivery_attempts` a direct parcel auto-returns and the paid buyer is auto-refunded | `courierFailDelivery` + `settleReturnedSubOrder` |
| 7 | Driver accumulates COD cash and never remits | Blocked from new auto-assignments over `driver_cash_limit` or age > `driver_cod_max_age_hours` | `lib/cod-guard.ts` |
| 8 | Cart abandoned | Reminder sent (idempotent) | `remindAbandonedCarts`, cron |

This is genuinely more automation than most projects at this stage. The gaps
below are the states that still have **no clock**.

## 2. Gaps found (ranked)

### GAP-1 (HIGH) — Assignment → pickup window has no consent, no clock ✅ fixed in this change

Auto-assignment (`lib/courier-assign.ts`) wrote `driverId` and sent a push —
the driver never agreed, no deadline existed, and nothing ever escalated. A
sleeping / far / unwilling driver silently froze the parcel until ops noticed
by hand. Big-platform standard is offer → accept/decline → timeout →
cascade to next driver → escalate to dispatch when the pool is dry
(Uber/DoorDash offer countdowns; Shopee/Noon hub SLA timers).

**Fixed by the driver-offer system in this change** (`ShipmentOffer` model,
accept/decline actions, expiry sweep, cascade with decliner exclusion,
one-shot ops escalation). See `docs/EXPRESS-DELIVERY.md`.

### GAP-2 (HIGH) — Dispatch is time-blind (night orders) ✅ fixed in this change

An order confirmed at 2 AM was offered/assigned immediately; every SLA clock
kept ticking while the whole country slept. Platforms use daily cutoffs and
business-hours SLA clocks: overnight work queues and dispatches in a morning
wave.

**Fixed in this change**: `dispatch_hours_start/end` settings; assignment
outside the window queues the parcel; offer clocks only tick during dispatch
hours; the cron sweep runs the morning wave.

### GAP-3 (MEDIUM) — COD order never confirmed by the seller

`expireStaleOrders` deliberately skips COD (`paymentMethod: { not: "COD" }`),
so a COD order whose seller never confirms sits PENDING forever — the buyer
waits indefinitely and nobody is alerted. (Prepaid orders expire; post-ship
stalls are caught by the stuck-shipment sweep; but PENDING/CONFIRMED **COD**
orders pre-shipment have no clock.) Shopee/Lazada auto-cancel unconfirmed or
unshipped orders after N days and count it against the seller.

Suggested: `seller_confirm_days` + `seller_ship_days` settings; auto-cancel +
notify buyer + seller strike after the deadline; surface "orders at risk" on
the seller dashboard.

### GAP-4 (MEDIUM) — No driver reliability memory

Nothing records how often a driver declines, times out, or lets parcels
auto-return. `pickCourierForShipment` ranks only by load/distance, so the
least reliable driver keeps receiving offers on equal terms. Platforms rank
dispatch by acceptance/on-time history and pause chronic offenders.

The `ShipmentOffer` table added in this change captures the raw data
(offer → outcome per driver); the remaining work is a scorecard (rate per
driver), a ranking factor in `pickCourierForShipment`, and an auto-pause
threshold — mirroring how `cod-guard` already pauses over-limit drivers.

### GAP-5 (MEDIUM) — Escalations notify, but nothing re-checks

`sweepStuckShipments` and the point sweeps alert staff **once** (one-shot
guards). If staff also do nothing, that's the end of the chain. Platforms
re-escalate on a schedule (24h unacknowledged → repeat / escalate wider).
Suggested: age-tiered re-alerts (e.g. re-flag after 48h unresolved), and an
"unresolved escalations" count on the admin dashboard.

### GAP-6 (LOW) — Buyer-facing promise vs. dispatch reality

Checkout shows ETA ranges (`std/express_eta_*_days`) but they don't account
for the dispatch cutoff: an order at 23:50 shows the same promise as one at
09:00. Suggested: when the order lands outside dispatch hours, extend the
displayed ETA start by one day. Cosmetic, but it is how big platforms keep
midnight buyers calm.

### GAP-7 (LOW) — `stale_parcel_days` / stuck threshold not business-hours aware

The 7-day stuck window is long enough that this barely matters, but the
shorter clocks added over time (offer timeout, any future confirm SLA) must
count business hours — the offer sweep added in this change already does.

## 3. Standing rule for future audits

A feature is not "done like Amazon/Shopee" until every state it introduces
answers four questions:

1. **Clock** — what is the deadline for the next actor?
2. **Consequence** — what happens automatically when it lapses?
3. **Cascade** — who is tried next, and who is told when nobody is left?
4. **Calendar** — does the clock respect working hours?

Any new state machine (orders, parcels, returns, payouts, KYC…) should land
with its sweep in the same PR, wired into `/api/cron/*`.
