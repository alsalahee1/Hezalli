# DECISIONS — Hezalli Product & Platform Decisions

> Output of **Phase 1, Step 1.1** (the decisions interview). This is the
> single source of truth for the choices every later phase builds on. If a
> decision changes, update it here **and** in `ARCHITECTURE.md` / `DATABASE.md`
> in the same commit.

_Last updated: 2026-07-23._

---

## 1. Country / region of launch

**Yemen.** 🇾🇪

Implications that ripple through the build:

- Payments: international card gateways (Stripe, most PayTabs/HyperPay flows)
  do **not** reliably operate for Yemen-based accounts, so the platform is
  **manual-payment-first** (see §4).
- Multiple currencies circulate in daily life (see §3).
- Arabic-first UI with RTL (see §2).
- Delivery/courier coverage varies by governorate, so shipping is flexible
  (see §5).

## 2. Languages

**Arabic + English, with full RTL.**

- **Arabic is the default** language and the default layout direction is
  **right-to-left (RTL)**.
- English is available via a language switcher; layout flips to LTR.
- i18n and RTL are set up **now** (Phase 2.3) using `next-intl` — retrofitting
  RTL later is painful.
- All user-facing strings go through translation files from day one.

## 3. Currency / currencies

**Base (settlement) currency: USD.** Display currencies: **USD, YER, SAR, AED.**

- The money **ledger** — order totals of record, commission, seller balances,
  payouts, refunds — is stored and computed in **USD** (stable reference; YER
  is volatile). **USDT is treated as 1:1 with USD.**
- Canonical product prices are entered/stored in **USD**.
- Buyers can **view** prices in YER / SAR / AED / USD, converted from USD using
  **admin-managed exchange rates**.
- At checkout, each order **snapshots** the chosen display currency, the
  exchange rate used, and the resulting local amount, so the amount a courier
  collects (for COD) or a buyer transfers is **fixed at order time** even if
  rates move afterward.
- The Yemeni rial circulates at **two very different values** — the old rial
  in the Sana'a-area governorates and the floating (new) rial in the
  Aden-area governorates — so YER rates are managed per **currency zone**
  (`NORTH` / `SOUTH`, mapped from the governorate in
  `lib/currency-constants.ts`), with a `DEFAULT` fallback row. Browsing uses
  the buyer's default-address zone; the checkout snapshot uses the **delivery
  address** zone, so a COD courier always collects the amount shown at
  checkout.

## 4. Payment methods for launch

All launch methods are **manual-confirmation** flows (no automated card
gateway). Chosen methods:

1. **Cash on Delivery (COD)** — buyer pays cash to the courier/seller on
   delivery. The backbone method.
2. **Local wallets** — Yemeni mobile-money rails (e.g. **Jawali, Jaib, Floosak,
   Al-Kuraimi / Kuraimi Cash**). Buyer pays to a platform/seller wallet and
   submits a reference; confirmed manually. APIs can be integrated later.
3. **Manual bank transfer** — buyer transfers and uploads proof; admin/seller
   confirms.
4. **USDT (Tether)** — stablecoin, treated as USD 1:1. Buyer sends to a
   platform USDT address (network recorded, e.g. TRC20/ERC20) and submits the
   transaction hash; confirmed manually.

> **No Stripe / no automated card gateway at launch.** The `Payment` model is
> built so an automated gateway can be added later without schema changes.

### Escrow & COD nuance

- **Prepaid methods (wallet / bank transfer / USDT):** the platform **holds the
  money in escrow** and credits the seller only when the buyer confirms "order
  received" (or after auto-complete). On a pre-completion return/dispute, the
  buyer is refunded and the seller is never credited.
- **COD:** the seller/courier collects the cash directly, so there is nothing to
  hold. Instead the platform's **10% commission is charged to the seller's
  balance** as an amount owed. A seller balance may therefore go **negative**
  (owes the platform) until settled.

## 5. Who ships

**Hybrid.**

- **Default (eBay-style):** each seller ships themselves and enters a **tracking
  number** and status updates manually.
- **Optional (Shopee-style):** the platform can offer **partnered couriers** a
  seller may opt into. Modeled from day one (a `Carrier` list + a
  `platformManaged` flag on shipments) but partner integrations can come later.
- Shipping zones are **Yemeni governorates**; fees are configurable per zone.

## 6. Commission model

**10% flat** of each **completed** order (buyer received).

- Stored as a **configurable admin setting** (a platform default, overridable
  per category or per seller later), not hard-coded.
- Commission applies to **completed orders only** — never to cancelled or
  refunded orders.

## 7. Seller approval

**Automatic** — a registered user can open a store and start selling
**immediately** (no admin approval gate to list).

- **KYC is retained** in the data model but is **not** a gate to *listing*. It
  gates **getting paid**: payouts require a **VERIFIED** KYC status plus payout
  details (bank / wallet / USDT address). Verified sellers also get a trust
  badge.
- Admin can **suspend** abusive sellers after the fact (post-moderation model).

## 8. Product approval

**Instant listing, moderate after.**

- Because sellers self-serve, products publish **immediately** (`ACTIVE`).
- Admin can **hide/remove** violating products and warn/suspend sellers.
- The schema keeps moderation fields (moderator, reason, timestamps) for audit.

## 9. Categories at launch

**10 top-level categories** (admin can add/edit/reorder/nest later):

1. Electronics
2. Phones & Accessories
3. Fashion & Apparel
4. Home & Kitchen
5. Health & Beauty
6. Groceries & Food
7. Baby, Kids & Toys
8. Books & Stationery
9. Sports & Outdoors
10. Automotive & Tools

Categories are a **tree** (self-referencing parent/child) so subcategories can
be added without a migration.

## 10. Name / branding & domain

- **Name:** **Hezalli** (confirmed).
- **Domain:** **www.hezalli.com** (configured for production in Phase 16;
  `NEXT_PUBLIC_APP_URL` points here in production).
- **Assistant bot name:** **Shadi (شادي)** (confirmed). Any assistant /
  support / auto-reply bot the platform ships (see Phase 17.7 auto-reply chat
  and Phase 17.11) presents itself as **"شادي"** in Arabic and **"Shadi"** in
  English — in chat UI, notifications, and email signatures alike. The name
  goes through the translation files like every other user-facing string.

## 11. MVP cut-line

**Full build** — implement **all phases (1–17)** before considering the product
"done", following the plan in order. There is no reduced launch scope; each
phase still ships and is verified on its own before moving to the next.

---

## Decisions summary table

| # | Decision | Choice |
|---|---|---|
| 1 | Region | Yemen |
| 2 | Languages | Arabic + English, RTL (Arabic default) |
| 3 | Currency | USD base/ledger; display USD·YER·SAR·AED (admin rates); USDT = USD 1:1 |
| 4 | Payments | COD, local wallets, manual bank transfer, USDT — all manual-confirm |
| 5 | Shipping | Hybrid: sellers ship + tracking, optional platform couriers; zones = governorates |
| 6 | Commission | 10% flat, configurable, on completed orders only |
| 7 | Seller onboarding | Automatic to sell; KYC gates payouts only |
| 8 | Product listing | Instant publish, moderate after |
| 9 | Categories | 10 top-level (tree, admin-editable) |
| 10 | Brand / domain | Hezalli / www.hezalli.com; assistant bot named **Shadi (شادي)** |
| 11 | MVP cut-line | Full build (phases 1–17) |

---

> **🔜 NEXT-STEP CARD**
> - **Next step:** 1.2 — System architecture document (`ARCHITECTURE.md`)
> - **Model:** Claude Opus 4.8 (best available)
> - **Thinking level:** High
> - **Session:** Same session
