// Reloadly airtime provider (Step 20). A concrete BillProvider that fulfils
// AIRTIME purchases through Reloadly's aggregator API — one integration covering
// Yemen Mobile, Sabafon, and YOU (MTN). It auto-detects the operator from the
// phone number, submits the top-up, and maps the result onto the seam:
//   SUCCESSFUL → COMPLETED · PROCESSING → PENDING · FAILED/REFUNDED → FAILED.
//
// The wallet is already debited when fulfill() runs, so anything unexpected
// (missing config, network error, HTTP error) THROWS — payBill catches it and
// leaves the purchase PENDING for an admin, so money is never lost.
//
// Config (env — never commit secrets):
//   RELOADLY_CLIENT_ID, RELOADLY_CLIENT_SECRET   (from the Reloadly dashboard)
//   RELOADLY_ENV = "sandbox" | "live"            (default "sandbox")
//   RELOADLY_AUDIENCE                            (optional override)
// The Reloadly account should be USD-denominated so the wallet's USD amount maps
// 1:1 to the top-up amount. Bills (kind !== AIRTIME) are left PENDING — wire a
// separate biller provider for those.
import type {
  BillFulfillInput,
  BillFulfillment,
  BillProvider,
} from "@/lib/providers/bill-provider";
import { registerBillProvider } from "@/lib/providers/bill-provider";

const AUTH_URL = "https://auth.reloadly.com/oauth/token";
const LIVE_BASE = "https://topups.reloadly.com";
const SANDBOX_BASE = "https://topups-sandbox.reloadly.com";
const ACCEPT = "application/com.reloadly.topups-v1+json";

function config() {
  const clientId = process.env.RELOADLY_CLIENT_ID;
  const clientSecret = process.env.RELOADLY_CLIENT_SECRET;
  const live = process.env.RELOADLY_ENV === "live";
  const base = live ? LIVE_BASE : SANDBOX_BASE;
  // Reloadly documents the live topups URL as the audience; allow an override
  // in case a sandbox account needs the sandbox audience.
  const audience = process.env.RELOADLY_AUDIENCE || LIVE_BASE;
  return { clientId, clientSecret, base, audience };
}

// Cached OAuth token (per server instance). Refreshed shortly before expiry.
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  const { clientId, clientSecret, audience } = config();
  if (!clientId || !clientSecret) {
    throw new Error("Reloadly is not configured (missing client id/secret)");
  }
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - 60_000 > now) {
    return cachedToken.value;
  }
  const res = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
      audience,
    }),
  });
  if (!res.ok) {
    throw new Error(`Reloadly auth failed (${res.status})`);
  }
  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  cachedToken = {
    value: data.access_token,
    expiresAt: now + (data.expires_in ?? 3600) * 1000,
  };
  return cachedToken.value;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const { base } = config();
  const token = await getToken();
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: ACCEPT,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const message =
      (body && (body.message || body.errorCode)) || `HTTP ${res.status}`;
    throw new Error(`Reloadly ${path} failed: ${message}`);
  }
  return body as T;
}

// Digits only, no leading +/00 — Reloadly wants the national/E.164 number.
function normalizePhone(account: string): string {
  return account.replace(/[^\d]/g, "");
}

async function fulfillAirtime(
  input: BillFulfillInput,
): Promise<BillFulfillment> {
  const phone = normalizePhone(input.account);

  // 1) Detect the operator for this Yemeni number.
  const operator = await api<{ operatorId?: number; id?: number }>(
    `/operators/auto-detect/phone/${encodeURIComponent(
      phone,
    )}/countries/YE?suggestedAmountsMap=false`,
  );
  const operatorId = operator.operatorId ?? operator.id;
  if (!operatorId) {
    return { status: "FAILED", reason: "operator not detected" };
  }

  // 2) Submit the top-up (amount is in the account's sender currency = USD).
  const topup = await api<{
    transactionId?: number;
    operatorTransactionId?: string | null;
    status?: string;
  }>("/topups", {
    method: "POST",
    body: JSON.stringify({
      operatorId,
      amount: input.amountUsd,
      useLocalAmount: false,
      customIdentifier: input.purchaseId,
      recipientPhone: { countryCode: "YE", number: phone },
    }),
  });

  const reference = String(
    topup.operatorTransactionId ?? topup.transactionId ?? input.purchaseId,
  );
  const status = (topup.status ?? "").toUpperCase();
  if (status === "SUCCESSFUL") return { status: "COMPLETED", reference };
  if (status === "PROCESSING" || status === "PENDING") {
    return { status: "PENDING" };
  }
  return { status: "FAILED", reason: `provider status ${status || "unknown"}` };
}

export const reloadlyAirtimeProvider: BillProvider = {
  id: "reloadly",
  async fulfill(input) {
    // This adapter handles airtime only; leave bills for a biller provider.
    if (input.kind !== "AIRTIME") return { status: "PENDING" };
    return fulfillAirtime(input);
  },
};

registerBillProvider(reloadlyAirtimeProvider);
