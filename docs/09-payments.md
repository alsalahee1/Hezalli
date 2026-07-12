# 09 — Phase 9: Payments

**Goal:** Buyers can pay by card online; the platform takes its commission; sellers see balances and get payouts; refunds work.
**Prerequisite:** Phase 8 complete (COD orders working).

> ⚠️ **Money rules for every step in this phase:**
> - Use the gateway's **TEST mode** until Phase 16. Never commit API keys — `.env` only.
> - Amounts are stored in the smallest currency unit (cents/halalas) as integers — never floats.
> - The **webhook** is the source of truth for "paid", never the browser redirect.

---

## Step 9.1 — Gateway setup & card payment 🧠

Using the gateway chosen in DECISIONS.md (Stripe shown; Moyasar/Tap/PayTabs are structurally the same — Claude adapts):

- Create a gateway test account; put test keys in `.env`
- Checkout payment step now offers **Card** and **COD**
- Card flow: place order as `PENDING_PAYMENT` → create gateway checkout/payment intent for the order total → redirect/embed payment UI → **webhook** confirms success → order becomes `CONFIRMED`, `Payment` record saved (gateway id, amount, status)
- Failure/abandon flow: order stays `PENDING_PAYMENT` with a **"Pay now"** retry button on the order page; auto-cancel + stock restore after 24h unpaid (scheduled job or lazy expiry check)
- Webhook endpoint verified with the gateway signature; idempotent (same event twice = no double effects)

✅ **Acceptance criteria**
- [ ] Test card payment completes and the order flips to CONFIRMED *via the webhook* (test with gateway CLI/test events)
- [ ] Declined card leaves the order payable; retry works
- [ ] Unpaid orders expire and restore stock

> **🔜 NEXT-STEP CARD**
> - **Next step:** 9.2 — Commission & seller balances
> - **Model:** Claude Opus 4.8
> - **Thinking level:** High
> - **Session:** Same session
> - **New-session prompt (if needed):**
> ```
> I am building the Hezalli marketplace. Read docs/09-payments.md.
> Step 9.1 (card payments + webhook) is done. Do Step 9.2: commission
> calculation and seller balance ledger, as described. Commit, push,
> then show me the Next-Step Card for 9.3.
> ```

---

## Step 9.2 — Commission & seller balances 🧠

- Platform **commission rate** configurable in admin settings (global % + optional per-category override)
- When a sub-order reaches `COMPLETED` (buyer confirmed received, or auto-completed — Phase 10): credit the seller's balance with `item total + shipping − commission`, as an immutable **ledger entry** (never edit balances directly; balance = sum of ledger)
- `/seller/finance`: current balance, pending balance (orders not yet completed), ledger table, per-order earning breakdown
- COD orders: same ledger logic; note in docs that COD cash is collected by the courier/seller and commission is deducted from balance (standard marketplace practice)

✅ **Acceptance criteria**
- [ ] Completing a test order produces a correct ledger entry (hand-check the math)
- [ ] Cancelled/refunded orders never credit the seller

> **🔜 NEXT-STEP CARD**
> - **Next step:** 9.3 — Refunds
> - **Model:** Claude Opus 4.8
> - **Thinking level:** High
> - **Session:** Same session
> - **New-session prompt (if needed):**
> ```
> I am building the Hezalli marketplace. Read docs/09-payments.md.
> Steps 9.1–9.2 are done. Do Step 9.3: refunds through the gateway and
> ledger reversal, as described. Commit, push, then show me the
> Next-Step Card for 9.4.
> ```

---

## Step 9.3 — Refunds

- Admin (and later the returns flow in Phase 11) can refund a sub-order fully or partially
- Card orders: call the gateway refund API; record `Refund`; order/sub-order → `REFUNDED`; reverse any seller ledger credit
- COD orders: record a manual refund (money returned outside the system) with note
- Buyer sees refund status on the order page; emails sent

✅ **Acceptance criteria**
- [ ] Test-mode gateway refund works end-to-end and the ledger stays consistent

> **🔜 NEXT-STEP CARD**
> - **Next step:** 9.4 — Seller payouts
> - **Model:** Claude Sonnet 5
> - **Thinking level:** Medium
> - **Session:** Same session (or new if long)
> - **New-session prompt (if needed):**
> ```
> I am building the Hezalli marketplace. Read docs/09-payments.md.
> Steps 9.1–9.3 are done. Do Step 9.4: seller payout requests and the
> admin payout queue, as described. Commit, push, then show me the
> Next-Step Card for Phase 10.
> ```

---

## Step 9.4 — Seller payouts

Simple manual payouts for launch (automatic bank transfers can come later):

- Seller requests a payout of available balance (minimum amount configurable) → `Payout` record `REQUESTED`
- `/admin/payouts`: queue of requests; admin pays via bank transfer outside the system, then marks `PAID` (with reference note) → ledger debit entry
- Seller sees payout history and status; email notifications

✅ **Acceptance criteria**
- [ ] Request → approve → balance decreases; history correct on both sides

> **🔜 NEXT-STEP CARD — PHASE 9 COMPLETE 🎉**
> - **Next step:** Phase 10, Step 10.1 — Shipping rates & zones
> - **Model:** Claude Sonnet 5
> - **Thinking level:** Medium
> - **Session:** NEW session (new phase)
> - **Paste this prompt:**
> ```
> I am building the Hezalli marketplace. Phases 1–9 are done (orders and
> real payments work). Read docs/10-shipping-delivery.md and
> docs/DECISIONS.md (who ships), review the existing code briefly, then
> implement Step 10.1 exactly as described. Commit, push, then show me
> the Next-Step Card for 10.2.
> ```
