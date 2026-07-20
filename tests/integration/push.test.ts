// Web Push subscription storage + the "no-op when unconfigured" guarantee.
// VAPID env is intentionally unset here, so sendPushToUser must do nothing.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

import { POST as subscribe } from "@/app/api/push/subscribe/route";
import { POST as unsubscribe } from "@/app/api/push/unsubscribe/route";
import { pushEnabled, sendPushToUser } from "@/lib/push";
import { prisma } from "@/lib/prisma";

const as = (id: string | null) =>
  authMock.mockResolvedValue(id ? { user: { id } } : null);

const req = (body: unknown) =>
  new Request("http://test/api/push", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

let userId: string;
const endpoint = `https://push.example.com/${Math.random().toString(36).slice(2)}`;

beforeAll(async () => {
  const u = await prisma.user.create({
    data: {
      email: `push-${Date.now().toString(36)}@t.local`,
      roles: ["COURIER"],
      locale: "en",
    },
  });
  userId = u.id;
});

afterAll(async () => {
  await prisma.pushSubscription
    .deleteMany({ where: { userId } })
    .catch(() => {});
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
});

describe("push subscription API", () => {
  it("rejects an unauthenticated subscribe", async () => {
    as(null);
    const res = await subscribe(
      req({ endpoint, keys: { p256dh: "x", auth: "y" } }),
    );
    expect(res.status).toBe(401);
  });

  it("stores a subscription and is idempotent by endpoint", async () => {
    as(userId);
    const r1 = await subscribe(
      req({ endpoint, keys: { p256dh: "key1", auth: "auth1" } }),
    );
    expect(r1.status).toBe(200);
    let rows = await prisma.pushSubscription.findMany({ where: { userId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].p256dh).toBe("key1");

    // Same endpoint again → update, not a duplicate.
    await subscribe(req({ endpoint, keys: { p256dh: "key2", auth: "auth2" } }));
    rows = await prisma.pushSubscription.findMany({ where: { userId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].p256dh).toBe("key2");
  });

  it("rejects a malformed subscription", async () => {
    as(userId);
    const res = await subscribe(req({ endpoint: "", keys: {} }));
    expect(res.status).toBe(400);
  });

  it("unsubscribes the caller's device", async () => {
    as(userId);
    const res = await unsubscribe(req({ endpoint }));
    expect(res.status).toBe(200);
    const rows = await prisma.pushSubscription.findMany({ where: { userId } });
    expect(rows).toHaveLength(0);
  });
});

describe("sendPushToUser without VAPID configured", () => {
  it("is disabled and no-ops (never throws, keeps subscriptions)", async () => {
    expect(pushEnabled()).toBe(false);
    await prisma.pushSubscription.create({
      data: { userId, endpoint: endpoint + "-2", p256dh: "a", auth: "b" },
    });
    await expect(
      sendPushToUser(userId, { title: "hi", body: "there" }),
    ).resolves.toBeUndefined();
    // Nothing pruned, since we never attempted a send.
    const rows = await prisma.pushSubscription.findMany({ where: { userId } });
    expect(rows).toHaveLength(1);
  });
});
