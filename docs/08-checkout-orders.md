# 08 — Phase 8: Checkout & Orders

**Goal:** Buyers place orders; buyers and sellers manage them through a clear status lifecycle. (Payment collection is Phase 9 — this phase wires everything using **Cash on Delivery** so the full loop works first.)
**Prerequisite:** Phase 7 complete.

**Order status flow (from Phase 1 design):**
`PENDING_PAYMENT → CONFIRMED → PROCESSING → SHIPPED → DELIVERED → COMPLETED`, plus `CANCELLED` and `REFUNDED`. COD orders skip straight to `CONFIRMED`.

---

## Step 8.1 — Checkout flow 🧠

`/checkout` (from selected cart items or Buy Now):

- **Step 1 — Address**: pick from address book or add new (reuses Phase 3 components)
- **Step 2 — Shipping**: per-seller group, choose shipping option (for now: one flat "Standard shipping" rate — real rates in Phase 10)
- **Step 3 — Payment method**: show **Cash on Delivery** only for now (card comes in Phase 9); coupon code box (disabled placeholder until Phase 13)
- **Step 4 — Review & place order**: full summary — items per seller, shipping per seller, totals
- **Placing the order (transactional, get this right):**
  - Re-validate stock and prices server-side
  - Create one `Order` + one `SubOrder` per seller + `OrderItem`s with **price snapshots**
  - **Decrement stock atomically** (no overselling under concurrent checkouts)
  - Clear purchased items from cart
  - Order confirmation page + email to buyer, notification email to each seller

✅ **Acceptance criteria**
- [ ] A cart with items from 2 sellers creates 1 order with 2 sub-orders, correct totals
- [ ] Stock decreases; buying more than stock is blocked at placement time
- [ ] Confirmation page + emails work

> **🔜 NEXT-STEP CARD**
> - **Next step:** 8.2 — Buyer order pages
> - **Model:** Claude Sonnet 5
> - **Thinking level:** Medium
> - **Session:** Same session
> - **New-session prompt (if needed):**
> ```
> I am building the Hezalli marketplace. Read docs/08-checkout-orders.md.
> Step 8.1 (checkout + order creation) is done. Do Step 8.2: buyer order
> list and order detail pages with cancel flow, as described. Commit,
> push, then show me the Next-Step Card for 8.3.
> ```

---

## Step 8.2 — Buyer order pages

- `/account/orders`: tabs by status (All / To pay / To ship / To receive / Completed / Cancelled / Returns), order cards with items, status, total
- `/account/orders/[id]`: full detail — items, address, shipping choice, payment method, per-status timeline (status history with timestamps), totals breakdown
- **Cancel order** button (allowed only while not yet SHIPPED; restores stock; notifies seller)
- Buttons that arrive later shown disabled with hints: "Track" (Phase 10), "Confirm received" (Phase 10), "Review" (Phase 11), "Return" (Phase 11)
- Downloadable/printable **invoice** (simple PDF or print-styled page)

✅ **Acceptance criteria**
- [ ] Buyer sees accurate history; cancelling restores stock and updates both sides

> **🔜 NEXT-STEP CARD**
> - **Next step:** 8.3 — Seller order management
> - **Model:** Claude Sonnet 5
> - **Thinking level:** Medium
> - **Session:** Same session (or new if long)
> - **New-session prompt (if needed):**
> ```
> I am building the Hezalli marketplace. Read docs/08-checkout-orders.md.
> Steps 8.1–8.2 are done. Do Step 8.3: the seller order management
> screens (accept, process, mark shipped placeholder), as described.
> Commit, push, then show me the Next-Step Card for Phase 9.
> ```

---

## Step 8.3 — Seller order management

- `/seller/orders`: sub-orders for this store, tabs by status, search by order #, buyer name
- Detail view: items, buyer's shipping address, totals, status timeline
- Actions: **Confirm/Accept** (CONFIRMED → PROCESSING), **Mark as shipped** (temporary simple version — Phase 10 replaces it with tracking numbers), **Cancel with reason** (restores stock, emails buyer)
- Print **packing slip**
- Every status change writes to status history and notifies the buyer by email

✅ **Acceptance criteria**
- [ ] Full happy path works end-to-end: buyer orders (COD) → seller confirms → processes → marks shipped → buyer sees status changes live

> **🔜 NEXT-STEP CARD — PHASE 8 COMPLETE 🎉**
> - **Next step:** Phase 9, Step 9.1 — Payment gateway setup
> - **Model:** Claude Opus 4.8 (money — highest care)
> - **Thinking level:** High (use plan mode)
> - **Session:** NEW session (new phase)
> - **Paste this prompt:**
> ```
> I am building the Hezalli marketplace. Phases 1–8 are done: full COD
> order loop works (checkout → seller ships → statuses). Read
> docs/09-payments.md and docs/DECISIONS.md (my chosen gateway), review
> the existing checkout code, then implement Step 9.1 exactly as
> described. Use plan mode first. Commit, push, then show me the
> Next-Step Card for 9.2.
> ```
