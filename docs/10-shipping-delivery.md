# 10 — Phase 10: Shipping, Delivery & "Received" Confirmation

**Goal:** Real shipping fees, tracking numbers, a tracking page, delivery confirmation, and the buyer's **"I received my order"** confirmation that completes the money loop.
**Prerequisite:** Phase 9 complete.

---

## Step 10.1 — Shipping rates & zones

- Seller shipping settings at `/seller/settings/shipping`: define shipping methods (e.g. Standard, Express) with fee rules — flat fee, free over X amount, and fee per zone (zones = country/city lists defined by admin at `/admin/shipping-zones`)
- Checkout now shows **real options and fees** per seller group based on the buyer's selected address (replaces the Phase 8 flat rate)
- Optional: platform default rates for sellers who haven't configured any

✅ **Acceptance criteria**
- [ ] Two addresses in different zones produce different fees at checkout
- [ ] "Free shipping over X" triggers correctly

> **🔜 NEXT-STEP CARD**
> - **Next step:** 10.2 — Seller shipping flow with tracking
> - **Model:** Claude Sonnet 5
> - **Thinking level:** Medium
> - **Session:** Same session
> - **New-session prompt (if needed):**
> ```
> I am building the Hezalli marketplace. Read docs/10-shipping-delivery.md.
> Step 10.1 (rates/zones) is done. Do Step 10.2: the real "mark as
> shipped" flow with carrier + tracking number and shipment records.
> Commit, push, then show me the Next-Step Card for 10.3.
> ```

---

## Step 10.2 — Seller shipping flow (tracking numbers)

Replaces the temporary "mark shipped" from Phase 8:

- Seller "Ship order" dialog: choose carrier (admin-managed carrier list: name, tracking URL template), enter tracking number, optional note → creates `Shipment`, sub-order → `SHIPPED`, buyer notified with tracking link
- Support partial shipping only if trivially easy — otherwise document it as out of scope for MVP
- Seller can edit a wrong tracking number (audit-logged)
- Seller "To ship" queue with aging indicator ("2 days waiting")

✅ **Acceptance criteria**
- [ ] Shipping an order records carrier + tracking and notifies the buyer with a working carrier link

> **🔜 NEXT-STEP CARD**
> - **Next step:** 10.3 — Buyer tracking & delivery confirmation
> - **Model:** Claude Sonnet 5
> - **Thinking level:** Medium
> - **Session:** Same session
> - **New-session prompt (if needed):**
> ```
> I am building the Hezalli marketplace. Read docs/10-shipping-delivery.md.
> Steps 10.1–10.2 are done. Do Step 10.3: buyer tracking page, "order
> received" confirmation, auto-complete job, and COD delivered flow.
> Commit, push, then show me the Next-Step Card for Phase 11.
> ```

---

## Step 10.3 — Buyer tracking & "order received" 🧠

The step that closes the loop:

- Order page "Track" button → tracking panel: carrier, tracking number, link, and the status timeline (SHIPPED → DELIVERED → COMPLETED)
- **Mark delivered**: seller or courier marks `DELIVERED` (with COD: this is also when payment is recorded as collected)
- Buyer **"Confirm order received"** button (enabled once SHIPPED): sub-order → `COMPLETED` → triggers the Phase 9 ledger credit to the seller → buyer prompted to review (Phase 11)
- **Auto-complete job**: N days after DELIVERED (configurable, e.g. 7) with no return request → auto `COMPLETED` (protects sellers from buyers who never confirm) — implement as a scheduled job (Vercel Cron) or lazy check
- "Not received?" link → opens a dispute (wired fully in Phase 11)

✅ **Acceptance criteria**
- [ ] Full E2E: pay by card → seller ships with tracking → delivered → buyer confirms received → seller balance credited
- [ ] Auto-complete works (test with N=0 days)

> **🔜 NEXT-STEP CARD — PHASE 10 COMPLETE 🎉 (You now have a working marketplace MVP!)**
> - **Next step:** Phase 11, Step 11.1 — Reviews & ratings
> - **Model:** Claude Sonnet 5
> - **Thinking level:** Medium
> - **Session:** NEW session (new phase)
> - **Paste this prompt:**
> ```
> I am building the Hezalli marketplace. Phases 1–10 are done — the full
> buy→pay→ship→receive loop works. Read docs/11-reviews-returns-disputes.md,
> review the existing code briefly, then implement Step 11.1 (reviews &
> ratings) exactly as described. Commit, push, then show me the
> Next-Step Card for 11.2.
> ```
