# 13 — Phase 13: Promotions & Marketing Tools

**Goal:** Coupons/vouchers (platform + per-seller), flash sales with countdowns, and free-shipping promos — the Shopee-style growth toolkit.
**Prerequisite:** Phase 9 complete (money flows), ideally 12 (notifications).

---

## Step 13.1 — Coupons & vouchers 🧠

- Voucher model: code, type (percentage / fixed amount / free shipping), value, max discount cap, minimum order amount, scope (**platform-wide** created by admin, or **store-specific** created by the seller), valid date range, total usage limit, per-user limit, active toggle
- Admin UI `/admin/vouchers` and seller UI `/seller/vouchers` (sellers can only scope to their own store)
- Checkout: voucher input (enable the placeholder from Phase 8) + list of applicable vouchers to pick; validation with clear errors (expired, minimum not met, used up)
- **Discount math rules (get these right):** store voucher applies to that seller's sub-order; platform voucher splits proportionally across sub-orders; discount recorded on the order and reflected in refund and seller-ledger calculations (seller pays for their voucher, platform pays for its voucher)
- Usage tracking per user; voucher shown on order details and invoices

✅ **Acceptance criteria**
- [ ] Percentage, fixed, and free-shipping vouchers each compute correctly on a multi-seller cart (hand-check the math)
- [ ] Limits enforced (per-user, total, expiry, minimum)
- [ ] Refunding a discounted order refunds the *paid* amount and adjusts ledgers correctly

> **🔜 NEXT-STEP CARD**
> - **Next step:** 13.2 — Flash sales
> - **Model:** Claude Sonnet 5
> - **Thinking level:** Medium
> - **Session:** Same session
> - **New-session prompt (if needed):**
> ```
> I am building the Hezalli marketplace. Read docs/13-promotions.md.
> Step 13.1 (vouchers) is done. Do Step 13.2: flash sales with
> countdowns and stock limits, as described. Commit, push, then show
> me the Next-Step Card for 13.3.
> ```

---

## Step 13.2 — Flash sales

- Admin creates a `FlashSale`: name, start/end time; sellers (or admin) enroll products with a special flash price and a flash stock limit per product
- Home page **flash sale section**: countdown timer, product cards with flash price + "X% claimed" progress bar
- `/flash-sale` page listing current + upcoming sessions
- During the sale window: PDP and checkout use the flash price; flash stock decremented atomically and separately; when flash stock is gone, price reverts
- Price returns to normal automatically at end time

✅ **Acceptance criteria**
- [ ] A live flash sale shows the countdown and sells at flash price; ends on time; flash stock limit enforced under concurrent orders

> **🔜 NEXT-STEP CARD**
> - **Next step:** 13.3 — Merchandising extras
> - **Model:** Claude Haiku 4.5
> - **Thinking level:** Low
> - **Session:** Same session
> - **New-session prompt (if needed):**
> ```
> I am building the Hezalli marketplace. Read docs/13-promotions.md.
> Steps 13.1–13.2 are done. Do Step 13.3: seller product discounts,
> store follow with new-follower voucher hook, and admin featured
> placements. Commit, push, then show me the Next-Step Card for Phase 14.
> ```

---

## Step 13.3 — Merchandising extras

- Seller per-product **discount scheduler** (sets compare-at pricing for a date range)
- **Follow store** button; followers count; (hook: sellers can send a voucher to followers — simple version)
- Admin **featured products / featured stores** slots used by home page sections
- "Deals" page aggregating all discounted products

✅ **Acceptance criteria**
- [ ] Scheduled discount activates and expires on time; featured slots render on home

> **🔜 NEXT-STEP CARD — PHASE 13 COMPLETE 🎉**
> - **Next step:** Phase 14, Step 14.1 — Admin dashboard & reports
> - **Model:** Claude Sonnet 5
> - **Thinking level:** Medium
> - **Session:** NEW session (new phase)
> - **Paste this prompt:**
> ```
> I am building the Hezalli marketplace. Phases 1–13 are done. Read
> docs/14-admin-panel.md, review the existing /admin code (several
> screens already exist from earlier phases), then implement Step 14.1
> exactly as described. Commit, push, then show me the Next-Step Card
> for 14.2.
> ```
