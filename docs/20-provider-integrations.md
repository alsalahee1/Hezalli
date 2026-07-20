# 20 — Payment-provider integrations (rails, airtime, bills)

How Hezalli connects the wallet's **cash-in / cash-out rails** and the
**bill/airtime fulfilment** to real providers. The code seam is done
(`lib/providers/bill-provider.ts`, Step 19.13); this doc is the *sourcing* side —
which providers exist, which are self-serve, and how to obtain the rest.

---

## 1. The landscape (three tiers)

| Need | Provider type | Access | Status in Hezalli |
|---|---|---|---|
| **Airtime top-up** (Yemen Mobile, Sabafon, YOU) | International aggregator (Reloadly, DingConnect) | **Self-serve API + sandbox** | ✅ Reloadly adapter built (Step 20) |
| **Utility bills** (electricity, water, internet) | Local aggregator / bank | Commercial agreement | ⏳ manual-confirm; no public API |
| **Mobile-money rails** (Jawali, Jaib, Floosak, Al-Kuraimi) | CBY-licensed e-wallets / banks | Commercial agreement (B2B) | ⏳ manual-confirm; no public API |

**Takeaway:** airtime can go live now for the price of a free account; bills and
the local rails require business development (contracts, KYC of Hezalli,
settlement terms) — there is no API to "sign up" for.

---

## 2. Airtime — Reloadly (built) / DingConnect (alternative)

- **Reloadly** — OAuth2 client-credentials, sandbox mode, `/topups` endpoint,
  operator auto-detect from the phone number, real-time status. Covers the Yemen
  operators. Docs: https://docs.reloadly.com/airtime — Yemen:
  https://operators.reloadly.com/mtn-sabafon-yemen-airtime-api/
- **DingConnect** — free signup, one API for many operators (Sabafon, Yemen
  Mobile, You). Docs: https://www.dingconnect.com/Api

### Go-live checklist (Reloadly)
1. Create a Reloadly account; generate **sandbox** API credentials.
2. Set env (see `.env.example`): `RELOADLY_CLIENT_ID`, `RELOADLY_CLIENT_SECRET`,
   `RELOADLY_ENV=sandbox`.
3. In Admin, set the `wallet_bills_provider` platform setting to `reloadly`
   (and `wallet_bills_enabled` on). Airtime purchases now auto-fulfil; bills stay
   manual.
4. Test an AIRTIME purchase end-to-end in sandbox (it never touches real money).
5. Fund the Reloadly account (USD-denominated) and flip `RELOADLY_ENV=live`.

The adapter is `lib/providers/reloadly-airtime.ts`. It maps
`SUCCESSFUL → COMPLETED`, `PROCESSING → PENDING`, `FAILED → FAILED` (refund), and
**throws on any config/network error so the purchase stays PENDING** — money is
never lost.

---

## 3. Local rails & bills — how to obtain access

No developer portal exists. Access = a signed merchant/PSP agreement. Contacts:

- **Jawali** — operated by **WeCash** (CBY-licensed e-money). App:
  Google Play `com.ama.wecashmobileapp`. Ask WeCash's corporate/merchant team.
- **Al-Kuraimi (Kuraimi Jawal)** — **Al-Kuraimi Islamic Microfinance Bank**
  (first CBY e-money licensee). Site: https://kuraimibank.com/en — corporate
  banking / e-payments department.
- **Floosak** — **YSYS / Y-Telecom**. App: Google Play `co.ysys.floosak`.
- **Jaib** — issuing bank's merchant services.
- **Yemen Mobile** — enterprise/wholesale desk for its own airtime & bill rails.

Regulatory note: holding balances / moving money over these is **regulated
e-money** — get a Central Bank of Yemen read before top-up / cash-out / P2P move
real money (see `docs/19-wallet-strategy.md` §4). This is the gating item, not
the code.

### What to request from every provider (comparison checklist)
- **Auth model** (API key / OAuth2 / mTLS) and IP allowlisting.
- **Endpoints**: initiate payment, query status, refund/void, balance.
- **Async model**: webhooks vs polling; retry & idempotency keys.
- **Sandbox** with test credentials + test accounts.
- **Settlement**: cycle, currency (YER/USD), reconciliation report format.
- **Fees**: per-transaction, monthly minimums, FX spread.
- **Limits**: per-transaction / daily caps, KYC tiers.
- **Onboarding**: documents needed (commercial registration, CBY status), timeline.
- **Support**: SLA, technical contact, incident process.

---

## 4. Adding a new provider (developer steps)

1. Implement `BillProvider` (`fulfill()` → `COMPLETED` | `FAILED` | `PENDING`) in
   `lib/providers/<name>.ts`; read secrets from env; **throw** on any error so
   the purchase stays PENDING.
2. `registerBillProvider(...)` at module load, and side-effect-import the file in
   `lib/actions/wallet-bills.ts` so it registers.
3. Add env keys to `.env.example`; unit-test the response mapping with a mocked
   `fetch` (see `tests/unit/reloadly-airtime.test.ts`).
4. Set `wallet_bills_provider` to the new id. No change to the money path.

Rails top-up / cash-out will get an analogous `RailProvider` seam when the first
rail agreement lands — same shape, pointed at `WalletTopUp` / `WalletWithdrawal`.
