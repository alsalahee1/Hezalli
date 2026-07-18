# 19 — Wallet Strategy: HezalliPay + Yemeni Rails

**Goal:** Add a Shopee-style stored-balance wallet ("HezalliPay") that buyers
top up and spend, while keeping the Yemeni mobile-money rails (Jawali, Jaib,
Floosak, Al-Kuraimi) as the **cash-in / cash-out methods** for that wallet — and
as direct order-payment methods, exactly as they are today.

**Prerequisite:** Phase 9 (payments, ledger, payouts) complete. This phase
**reuses** the seller ledger pattern; it does not replace it.

> ⚠️ **Read `## 4. Regulatory reality` before writing any top-up or cash-out
> code.** Holding customer balances is regulated e-money. Refund-to-wallet and
> cashback are low-risk; top-up, withdrawal, and P2P are not.

---

## 1. The two meanings of "wallet"

| | What it is | Shopee analogy | Status today |
|---|---|---|---|
| **External wallet** — Jawali, Jaib, Floosak, Kuraimi | A payment **rail** (you send/receive money over it) | TNG, GCash | ✅ Supported as manual-confirm methods (`PaymentMethod.WALLET`) |
| **HezalliPay** — our own wallet | A **stored balance** account inside the platform | ShopeePay | ❌ Not built for buyers — but the ledger pattern exists for sellers |

The strategy is: **our wallet is the account; the Yemeni rails are how money
gets into and out of it.** That is precisely how Shopee runs ShopeePay alongside
TNG.

---

## 2. Why this is low-effort for Hezalli

The seller side already implements every hard part (see `prisma/schema.prisma`
section F and `lib/actions/payment.ts`):

- `SellerBalance` — an account with `availableUsd` / `pendingUsd`
- `LedgerEntry` — **immutable** entries; **balance = sum of entries** (balances
  are never edited directly)
- `Payout` — withdrawal requests + admin approval queue
- `Payment` proof flow — `proof → AWAITING_CONFIRMATION → admin confirms`

A buyer wallet is these same three patterns pointed at buyers. USD-base ledger,
escrow ("platform holds the funds"), immutable double-entry, and manual-proof
confirmation are all already solved.

---

## 3. Where it lives: under this project (not a separate app)

**Build the wallet backend inside this codebase.** Non-negotiable reason:

> A wallet is a ledger, and there must never be two sources of truth for money.

A checkout that spends wallet balance and creates an order must commit or roll
back as **one database transaction**. Splitting that across two apps means
distributed transactions and cross-system reconciliation for customers' money —
the worst thing to fork.

**The mobile app does not change this.** Per `INTEGRATIONS.md` item 17.6, the
mobile app is a separate React Native/Expo **client** that reuses this app's API.
The wallet backend (ledger, server actions, API routes) is the source of truth
and lives here; the mobile app and the web UI are both just clients calling the
same wallet endpoints. "Separate app" only ever means a separate *client*, never
a separate *money backend*.

---

## 4. Regulatory reality (the real gate)

Holding customer balances that they can spend or withdraw makes Hezalli a
**de-facto e-money issuer**. In Yemen, mobile-money operates under **Central Bank
of Yemen** licensing. This is a legal/licensing question, not a technical one,
and it gates the risky phases:

- **Low risk** — refund-to-wallet, cashback: the money is *already* in escrow;
  we're only changing where a credit lands.
- **High risk / needs legal sign-off** — top-up, cash-out, P2P transfer: this is
  true stored value ("e-money").

**Cash-out is also the hardest operational problem**, not just legal — getting
money back out to a real Jawali/bank account is the same payout friction sellers
already face. Build the low-risk pieces first; get a legal read before enabling
top-up and withdrawal.

---

## 5. Fix the naming collision first

`PaymentMethod.WALLET` currently means "external local wallet, pay manually." An
internal wallet makes that name ambiguous. Rename before adding anything:

```prisma
enum PaymentMethod {
  COD
  LOCAL_WALLET      // was WALLET — external rails: Jawali, Jaib, Floosak, Kuraimi
  BANK_TRANSFER
  USDT
  HEZALLI_BALANCE   // NEW — pay from internal wallet: instant, no admin confirm
}
```

A data migration must map every existing `WALLET` row to `LOCAL_WALLET`.

---

## 6. Proposed schema additions

These belong in `prisma/schema.prisma` section F when **Step 19.1** is built (not
before — this repo adds code phase by phase). Balances are USD, integers of
record via `Decimal(12,2)`, matching the seller ledger.

```prisma
enum WalletEntryType {
  TOP_UP        // cash-in via a rail, admin-confirmed
  PAYMENT       // spent on an order
  REFUND        // order refunded to wallet
  CASHBACK      // loyalty / promo credit
  CASHOUT       // withdrawn to a rail
  ADJUSTMENT    // admin correction (audited)
}

enum WalletTopUpStatus {
  PENDING
  AWAITING_CONFIRMATION
  CONFIRMED
  REJECTED
}

model Wallet {
  id           String        @id @default(cuid())
  userId       String        @unique
  availableUsd Decimal       @default(0) @db.Decimal(12, 2)
  frozen       Boolean       @default(false)   // AML / dispute hold
  user         User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  entries      WalletEntry[]
  topUps       WalletTopUp[]
}

// Immutable. availableUsd MUST equal the sum of entries — never edit directly.
model WalletEntry {
  id         String          @id @default(cuid())
  walletId   String
  type       WalletEntryType
  amountUsd  Decimal         @db.Decimal(12, 2)   // +credit / -debit
  orderId    String?         // set for PAYMENT / REFUND
  topUpId    String?         // set for TOP_UP
  payoutId   String?         // set for CASHOUT (reuse Payout)
  note       String?
  createdAt  DateTime        @default(now())
  wallet     Wallet          @relation(fields: [walletId], references: [id], onDelete: Cascade)

  @@index([walletId])
}

// Cash-in request over a rail. Mirrors the Payment proof flow exactly.
model WalletTopUp {
  id          String            @id @default(cuid())
  walletId    String
  method      PaymentMethod     // LOCAL_WALLET | BANK_TRANSFER | USDT
  amountUsd   Decimal           @db.Decimal(12, 2)
  status      WalletTopUpStatus @default(PENDING)
  reference   String?
  proofUrl    String?
  usdtNetwork UsdtNetwork?
  usdtTxHash  String?
  confirmedBy String?
  confirmedAt DateTime?
  createdAt   DateTime          @default(now())
  updatedAt   DateTime          @updatedAt
  wallet      Wallet            @relation(fields: [walletId], references: [id], onDelete: Cascade)

  @@index([walletId])
  @@index([status])
}
```

Cash-out reuses the existing `Payout` model + `/admin/payouts` queue; no new
withdrawal table is needed — a paid cash-out writes one `WalletEntry` of type
`CASHOUT`.

**Invariants (enforce in code + a periodic reconciliation check):**
- `Wallet.availableUsd == sum(WalletEntry.amountUsd)` for that wallet.
- A wallet balance may never go negative (assert inside the spend transaction).
- Spending on an order and creating the order happen in one `prisma.$transaction`.

---

## 7. External rails as swappable adapters

This is the "Shopee also supports TNG" layer, and it matches the adapter
philosophy already in `INTEGRATIONS.md`. Formalize one adapter per rail:

```
lib/payments/rails/{jawali,jaib,floosak,kuraimi,bank,usdt}.ts
  each exports: displayName, cashInInstructions, verify?(), manualProofFallback
```

Today every adapter is "manual proof." When Kuraimi (or an aggregator) exposes an
API, swap **that one adapter** to automated — callers never change. Each rail
serves double duty: direct order payment **and** wallet top-up / cash-out.

---

## Step 19.1 — Buyer wallet ledger + refund-to-wallet 🧠

Lowest value-per-risk. Ship this first.

- Add `Wallet`, `WalletEntry`, `WalletEntryType` (schema above); migrate.
- Auto-create a wallet on first need (lazy) or at registration.
- `/account/wallet`: balance + immutable entry history.
- Refunds gain a **"refund to wallet"** option (admin + returns flow): writes a
  `REFUND` `WalletEntry` and recomputes balance in the same transaction as the
  refund record. Instant for the buyer — no cash-back friction.

✅ **Acceptance criteria**
- [ ] Refunding a test order to wallet credits exactly once; balance = sum of entries
- [ ] Balance never editable directly; a reconciliation script reports 0 drift

> **🔜 NEXT-STEP CARD**
> - **Next step:** 19.2 — Pay with wallet at checkout
> - **Model:** Claude Opus 4.8
> - **Thinking level:** High
> - **Session:** Same session
> - **New-session prompt (if needed):**
> ```
> I am building the Hezalli marketplace. Read docs/19-wallet-strategy.md.
> Step 19.1 (buyer wallet ledger + refund-to-wallet) is done. Do Step 19.2:
> pay-with-wallet at checkout as described. Commit, push, then show me the
> Next-Step Card for 19.3.
> ```

---

## Step 19.2 — Pay with wallet at checkout 🧠

- Rename `PaymentMethod.WALLET → LOCAL_WALLET`; add `HEZALLI_BALANCE`; migrate
  existing rows (§5).
- Checkout offers **HezalliPay balance** when `availableUsd >= grandTotal`.
- Paying debits the wallet (`PAYMENT` entry, negative) and confirms the order in
  **one transaction** — no admin confirmation, unlike every other method. Assert
  non-negative balance inside the transaction.
- Insufficient balance → method hidden or prompts top-up (19.3).

✅ **Acceptance criteria**
- [ ] Wallet payment confirms the order instantly and debits exactly once
- [ ] Concurrent double-spend is impossible (row lock / conditional update)
- [ ] Order refund of a wallet-paid order credits back to wallet

> **🔜 NEXT-STEP CARD**
> - **Next step:** 19.3 — Top-up via Yemeni rails (needs legal check)
> - **Model:** Claude Opus 4.8
> - **Thinking level:** High
> - **Session:** Same session
> - **New-session prompt (if needed):**
> ```
> I am building the Hezalli marketplace. Read docs/19-wallet-strategy.md,
> including §4 (regulatory). Steps 19.1–19.2 are done. Do Step 19.3: wallet
> top-up via the existing rails with the manual-proof flow. Commit, push,
> then show me the Next-Step Card for 19.4.
> ```

---

## Step 19.3 — Top-up via Yemeni rails ⚠️ (legal check first)

- `WalletTopUp` model + `WalletEntryType.TOP_UP`.
- User picks amount + rail (Jawali/Jaib/Floosak/Kuraimi/bank/USDT) → sees cash-in
  instructions → submits proof. **This reuses the `submitPaymentProof` →
  `confirmPayment` logic in `lib/actions/payment.ts`,** crediting a wallet instead
  of an order.
- Admin confirms in `/admin/payments` (add a top-ups tab) → `TOP_UP` entry written.
- Enforce per-user KYC-tiered top-up limits.

✅ **Acceptance criteria**
- [ ] Confirmed top-up credits the wallet exactly once; rejected top-up credits nothing
- [ ] Top-up over the KYC-tier limit is blocked

> **🔜 NEXT-STEP CARD**
> - **Next step:** 19.4 — Cash-out / withdrawal
> - **Model:** Claude Opus 4.8
> - **Thinking level:** High
> - **Session:** Same session
> - **New-session prompt (if needed):**
> ```
> I am building the Hezalli marketplace. Read docs/19-wallet-strategy.md (§4).
> Steps 19.1–19.3 are done. Do Step 19.4: wallet cash-out reusing the Payout
> model + admin queue, gated on KYC. Commit, push, then show the Next-Step Card.
> ```

---

## Step 19.4 — Cash-out / withdrawal ⚠️ (hardest: legal + operational)

- Buyer requests a withdrawal of available balance → reuse `Payout` (add wallet
  origin) + `/admin/payouts` queue.
- Gate behind **VERIFIED KYC** (same gate sellers already have — `DECISIONS.md`).
- On admin-paid: write one `CASHOUT` `WalletEntry` (negative) in the same
  transaction that marks the payout paid.
- Minimum withdrawal + daily/monthly limits configurable in admin settings.

✅ **Acceptance criteria**
- [ ] Request → approve → wallet decreases exactly once; history correct both sides
- [ ] Non-KYC user cannot withdraw

> **🔜 NEXT-STEP CARD — WALLET CORE COMPLETE 🎉**
> - **Next step (optional 19.5+):** cashback into wallet (done — see Step 19.5),
>   unify seller earnings into one wallet, P2P transfer (**only if licensed**).
> - **Model:** Claude Sonnet 5
> - **Thinking level:** Medium
> - **Session:** New session

---

## Step 19.5 — Purchase cashback into wallet ✅

- `wallet_cashback_rate` platform setting (admin settings; **0 = off by default**).
- On order completion, `settleSubOrder` credits `rate × items total` to the
  buyer's wallet as an idempotent `CASHBACK` entry (`lib/wallet-cashback.ts`).
- Parity with loyalty EARN points: not clawed back on a later refund (exposure
  bounded by the small rate; completion means receipt was confirmed).

✅ **Acceptance criteria**
- [ ] With a rate set, completing an order credits cashback exactly once
- [ ] Rate 0 is a no-op; re-settling never double-credits

> Remaining 19.5+ (not built): unify seller earnings into the same wallet, and
> P2P transfer — **licensed only**, gate behind the e-money authorization.

---

## 8. Build order summary (value per risk) — status

| Phase | Ships | Regulatory risk | Status |
|---|---|---|---|
| 19.1 Refund-to-wallet | Instant refunds | Low | ✅ shipped |
| 19.2 Pay with wallet | Instant checkout | Low | ✅ shipped |
| 19.3 Top-up | Cash-in | **High — legal first** | ✅ built, ⚠️ legal-gated |
| 19.4 Cash-out | Withdrawal | **High — legal first** | ✅ built, ⚠️ legal-gated |
| 19.5 Cashback | Growth loop | Low (off by default) | ✅ shipped |
| 19.5+ Seller-wallet unify / P2P | Growth loops | P2P = licensed only | ⏭️ deferred |

**Bottom line:** 19.1–19.5 are implemented. 19.1/19.2/19.5 are safe to run now;
**get a Central Bank of Yemen e-money read before 19.3/19.4 move real money in
production** — the code is built and gated, the remaining blocker is legal, not
technical. The wallet lives in this repo; the mobile app is a separate client on
the same API.
