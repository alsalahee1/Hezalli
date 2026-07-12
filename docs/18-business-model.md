# 18 — Business Model: How Hezalli Makes Money & Manages Vendors and Buyers

> This is a **business** document, not a coding phase. Read it before Phase 1 (it feeds your answers in the Step 1.1 interview) and re-read it before launch (Phase 16).

---

## 1. The core idea of a marketplace

Amazon, eBay, Shopee, Lazada, and Noon all do the same thing: **they stand in the middle of every transaction.**

- They **hold the buyer's money** until the order arrives (escrow)
- They **own the customer relationship** (accounts, data, communication)
- They **measure everyone's behavior** (seller metrics, buyer abuse detection)
- They **take a fee** for providing the one thing strangers can't create alone: **trust**

Everything in the Hezalli build plan exists to create that trust loop.

---

## 2. How Hezalli earns money (revenue streams)

| # | Stream | How it works | Real-world reference | Where in the plan |
|---|---|---|---|---|
| 1 | **Sales commission** ⭐ main one | Keep a % of every completed order | Amazon 8–15%, eBay ~13%, Shopee/Lazada 2–8% | Phase 9.2 (configurable in admin) |
| 2 | Payment/service fee | Small % or fixed fee per transaction | Shopee ~2% | Add as a settings field (easy extension of 9.2) |
| 3 | **Advertising** | Sellers pay to rank higher ("Sponsored" products) | Amazon's biggest-margin business | Phase 17 addition (after real traffic) |
| 4 | Seller subscriptions | Monthly fee for pro tools/analytics | Amazon Pro $39.99/mo | Phase 17 addition |
| 5 | Featured placement | Paid home-page & flash-sale slots | Shopee/Lazada campaigns | Phase 13.3 slots → make them paid later |
| 6 | Listing fees | Fee per listed product | eBay insertion fees | Optional, usually bad for young marketplaces |
| 7 | Fulfillment services | Store & ship sellers' goods for a fee | Amazon FBA | Far future — needs warehouses |
| 8 | Buyer membership | Buyers pay for free shipping/perks | Amazon Prime | Far future |

### Recommended pricing roadmap for Hezalli

1. **Launch (months 0–3):** 0% commission — sellers join free. Your only goal is supply (products) and first buyers. *Solves the chicken-and-egg problem: buyers won't come without products; sellers won't come without buyers. Recruit sellers manually, one by one.*
2. **Months 3–6:** turn on commission at a low rate (3–5%) + payment fee pass-through. Announce it in advance.
3. **After product–market fit:** raise commission toward market rates per category; introduce paid featured slots.
4. **At real traffic:** sponsored-product ads and seller subscriptions — the high-margin money.

> ⚠️ Commission applies to **completed** orders only (buyer received). Never charge sellers for cancelled/refunded orders — the ledger design in Phase 9.2 already guarantees this.

---

## 3. How Hezalli manages VENDORS (sellers)

The five tools every big platform uses, and where the plan implements them:

### 3.1 Gatekeeping — KYC before selling
ID/business verification, admin approval, re-application after rejection. Stops fraud at the door.
→ **Phase 4.1**

### 3.2 Escrow — hold the money (the #1 trust mechanism)
The seller does NOT receive money when the buyer pays. The platform holds it and credits the seller's balance **only when the buyer confirms "order received"** (or auto-complete after N days). No shipment → buyer refunded, seller gets nothing. This single rule forces good behavior.
→ **Phase 9.2 (ledger) + Phase 10.3 (release on COMPLETED)** — already exactly how the plan works.

### 3.3 Performance metrics → warnings → suspension
Track per seller: late-shipment rate, cancellation rate, return/complaint rate, chat response time, rating. Thresholds trigger: warning → products hidden from search → store suspended. (Amazon's "Order Defect Rate" must stay < 1%.)
→ Manual version: **Phase 14.2** (admin suspend). Automatic scoring: **add as item 17.11** when you have real order volume.

### 3.4 Content moderation
Product approval/rejection, banned-item policies, counterfeit reports, review moderation.
→ **Phases 5.4, 11.1, 14**

### 3.5 Tiers & incentives (carrot, not only stick)
Badges ("Preferred Seller", "Mall"), better search ranking and lower fees for high performers. Sellers compete to behave well.
→ Future 17.x item; the store-rating groundwork is in **Phase 11.1**.

**Also:** payout cycles with a holding period (payouts weekly/biweekly, Phase 9.4), seller education (write a simple "how to sell on Hezalli" guide page, Phase 14.3 CMS), and seller support via the admin dispute/chat tools.

---

## 4. How Hezalli manages BUYERS

### 4.1 Buyer protection guarantee
"Money back if it never arrives or isn't as described." Delivered by escrow + returns + disputes.
→ **Phases 10.3, 11.2, 11.3**. Market it loudly — put "Hezalli Buyer Protection" text on every product page.

### 4.2 The platform is the judge
When buyer and seller disagree, admin reviews evidence from both sides and decides where the money goes; the verdict executes automatically.
→ **Phase 11.3**

### 4.3 Buyer-abuse control
Buyers cheat too: false "not received" claims, fake return reasons, review blackmail, COD orders never accepted. Defenses:
- Evidence requirements on returns (photos) — **11.2**
- Delivery tracking as proof — **10.2/10.3**
- Phone verification for COD; block COD for buyers who repeatedly refuse delivery — settings + **14.2**
- Suspend abusive accounts (audit-logged) — **14.2**

### 4.4 Retention (keep buyers coming back)
Reviews build trust (**11.1**), vouchers & flash sales build excitement (**13**), notifications bring return visits (**12**), recommendations grow basket size (**17.4**), loyalty points (**17.9**).

---

## 5. Money flow diagram (one order, card payment)

```
Buyer pays 100
   │
   ▼
Payment gateway ──► Hezalli platform account (money is HELD — escrow)
   │                        Order: CONFIRMED → SHIPPED → DELIVERED
   ▼
Buyer clicks "Order received"  (or auto-complete after N days)
   │
   ▼
Seller balance ledger:  +100  − 8 commission (8%)  =  +92 pending payout
   │
   ▼
Seller requests payout → admin transfers 92 to seller's bank → ledger −92
                                     └── Hezalli keeps 8  ✅ profit
```

If a return/dispute happens **before** completion → refund the buyer from the held money; the seller is never credited. (COD: the courier/seller collects cash; commission is deducted from the seller's balance instead.)

---

## 6. Operating checklist (after launch — weekly)

- [ ] Review new seller applications (goal: respond < 24h)
- [ ] Check the dispute queue — fast, fair verdicts are your reputation
- [ ] Process payout requests on a fixed weekly day
- [ ] Scan worst sellers (late shipping, complaints) — warn or suspend
- [ ] Scan for buyer abuse patterns
- [ ] Watch metrics: GMV, take rate (your % of GMV actually earned), repeat-buyer rate, seller retention

---

> **🔜 NEXT-STEP CARD**
> - This document changes no code. If you haven't started Phase 1 yet, its answers feed directly into the **Step 1.1 decisions interview** (commission %, seller approval, payment methods).
> - When you later want automated seller scoring, sponsored ads, or subscriptions, start a NEW session with:
> ```
> Hezalli marketplace is running. Read docs/18-business-model.md and
> docs/17-post-launch-growth.md. I want to implement <seller performance
> scoring / sponsored product ads / seller subscriptions>. Propose a plan
> first (plan mode), then implement it step by step with acceptance
> criteria, commit, push, and a Next-Step Card.
> ```
