// Reloadly airtime adapter (Step 20). Pure unit test — mocks fetch to verify the
// provider maps Reloadly's responses onto the seam and stays safe when
// unconfigured. No network, no DB.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { reloadlyAirtimeProvider } from "@/lib/providers/reloadly-airtime";

type Json = Record<string, unknown>;

// Route a fake fetch by URL: auth → token, auto-detect → operator, topups → result.
function mockReloadly(topup: Json) {
  return vi.fn(async (url: string) => {
    const u = String(url);
    const ok = (body: Json) =>
      ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(body),
        json: async () => body,
      }) as unknown as Response;
    if (u.includes("oauth/token")) {
      return ok({ access_token: "tok", expires_in: 3600 });
    }
    if (u.includes("auto-detect")) return ok({ operatorId: 173 });
    if (u.includes("/topups")) return ok(topup);
    throw new Error(`unexpected url ${u}`);
  });
}

const input = {
  purchaseId: "bill_1",
  kind: "AIRTIME" as const,
  biller: "yemen-mobile",
  account: "+967 770 123 456",
  amountUsd: 5,
};

beforeEach(() => {
  vi.stubEnv("RELOADLY_CLIENT_ID", "id");
  vi.stubEnv("RELOADLY_CLIENT_SECRET", "secret");
  vi.stubEnv("RELOADLY_ENV", "sandbox");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Reloadly airtime provider (Step 20)", () => {
  it("maps SUCCESSFUL to COMPLETED with the operator reference", async () => {
    vi.stubGlobal(
      "fetch",
      mockReloadly({
        transactionId: 99,
        operatorTransactionId: "OP-99",
        status: "SUCCESSFUL",
      }),
    );
    const res = await reloadlyAirtimeProvider.fulfill(input);
    expect(res).toEqual({ status: "COMPLETED", reference: "OP-99" });
  });

  it("maps PROCESSING to PENDING", async () => {
    vi.stubGlobal(
      "fetch",
      mockReloadly({ transactionId: 100, status: "PROCESSING" }),
    );
    const res = await reloadlyAirtimeProvider.fulfill(input);
    expect(res.status).toBe("PENDING");
  });

  it("maps a failed status to FAILED (which refunds the wallet upstream)", async () => {
    vi.stubGlobal(
      "fetch",
      mockReloadly({ transactionId: 101, status: "FAILED" }),
    );
    const res = await reloadlyAirtimeProvider.fulfill(input);
    expect(res.status).toBe("FAILED");
  });

  it("leaves bills PENDING (this adapter is airtime-only)", async () => {
    vi.stubGlobal("fetch", mockReloadly({ status: "SUCCESSFUL" }));
    const res = await reloadlyAirtimeProvider.fulfill({
      ...input,
      kind: "BILL",
    });
    expect(res.status).toBe("PENDING");
  });

  it("throws when unconfigured so payBill leaves the purchase PENDING", async () => {
    vi.stubEnv("RELOADLY_CLIENT_ID", "");
    vi.stubEnv("RELOADLY_CLIENT_SECRET", "");
    vi.stubGlobal("fetch", mockReloadly({ status: "SUCCESSFUL" }));
    await expect(reloadlyAirtimeProvider.fulfill(input)).rejects.toThrow();
  });
});
