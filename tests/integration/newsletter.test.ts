// Step 17.8 — newsletter subscribe + admin broadcast over real Postgres.
// Mocks only the request-context boundaries (auth, getLocale).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next-intl/server", async (orig) => ({
  ...(await orig<typeof import("next-intl/server")>()),
  getLocale: vi.fn().mockResolvedValue("en"),
}));

import {
  broadcastNewsletter,
  subscribeNewsletter,
} from "@/lib/actions/newsletter";
import { prisma } from "@/lib/prisma";

const EMAIL = `nl-${Date.now().toString(36)}@t.local`;
let adminId: string;
let buyerId: string;

beforeAll(async () => {
  const admin = await prisma.user.create({
    data: { email: `${EMAIL}.admin`, roles: ["ADMIN"], locale: "en" },
  });
  adminId = admin.id;
  const buyer = await prisma.user.create({
    data: { email: `${EMAIL}.buyer`, roles: ["BUYER"], locale: "en" },
  });
  buyerId = buyer.id;
});

afterAll(async () => {
  await prisma.newsletterSubscriber.deleteMany({ where: { email: EMAIL } });
  await prisma.user
    .deleteMany({ where: { id: { in: [adminId, buyerId] } } })
    .catch(() => {});
});

describe("subscribeNewsletter", () => {
  it("captures a subscription (email normalized) and is idempotent", async () => {
    authMock.mockResolvedValue(null);
    const res = await subscribeNewsletter(`  ${EMAIL.toUpperCase()} `);
    expect(res.ok).toBe(true);
    const sub = await prisma.newsletterSubscriber.findUnique({
      where: { email: EMAIL },
    });
    expect(sub).not.toBeNull();

    // Opt out, then re-subscribe clears the opt-out.
    await prisma.newsletterSubscriber.update({
      where: { email: EMAIL },
      data: { unsubscribedAt: new Date() },
    });
    await subscribeNewsletter(EMAIL);
    const again = await prisma.newsletterSubscriber.findUniqueOrThrow({
      where: { email: EMAIL },
    });
    expect(again.unsubscribedAt).toBeNull();
  });

  it("rejects an invalid email", async () => {
    authMock.mockResolvedValue(null);
    expect((await subscribeNewsletter("not-an-email")).error).toBe("invalid");
  });
});

describe("broadcastNewsletter", () => {
  it("is admin-only", async () => {
    authMock.mockResolvedValue({ user: { id: buyerId } });
    expect((await broadcastNewsletter("Hi", "Body here")).error).toBe(
      "forbidden",
    );
  });

  it("requires a subject and body", async () => {
    authMock.mockResolvedValue({ user: { id: adminId } });
    expect((await broadcastNewsletter("", "")).error).toBe("empty");
  });

  it("fans out to active subscribers", async () => {
    authMock.mockResolvedValue({ user: { id: adminId } });
    const res = await broadcastNewsletter("Weekly deals", "Big savings inside");
    expect(res.ok).toBe(true);
    expect(res.sent).toBeGreaterThanOrEqual(1); // at least our subscriber
  });
});
