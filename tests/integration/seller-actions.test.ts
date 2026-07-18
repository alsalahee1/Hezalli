// Step 17.7 — exercises the real seller-tools server actions and the chat
// auto-reply path against local Postgres. Only the request-context boundaries
// are mocked: auth() (to impersonate a seller/buyer), and the next.js
// revalidatePath / next-intl getLocale helpers that need a live request.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", async (orig) => ({
  ...(await orig<typeof import("next/cache")>()),
  revalidatePath: vi.fn(),
}));
vi.mock("next-intl/server", async (orig) => ({
  ...(await orig<typeof import("next-intl/server")>()),
  getLocale: vi.fn().mockResolvedValue("en"),
}));

import { sendMessage } from "@/lib/actions/chat";
import {
  importProductsCsv,
  setAutoReply,
  setVacation,
} from "@/lib/actions/seller-tools";
import { prisma } from "@/lib/prisma";
import { makeFixture } from "./factory";

let fx: Awaited<ReturnType<typeof makeFixture>>;
let catSlug: string;

beforeAll(async () => {
  fx = await makeFixture();
  const cat = await prisma.category.findUniqueOrThrow({
    where: { id: fx.categoryId },
    select: { slug: true },
  });
  catSlug = cat.slug;
});

afterAll(async () => {
  await fx.cleanup();
});

describe("setVacation / setAutoReply", () => {
  it("persists the vacation flag + trimmed message", async () => {
    authMock.mockResolvedValue({ user: { id: fx.sellerUserId } });
    const res = await setVacation(true, "  Back on July 25  ");
    expect(res.ok).toBe(true);
    const store = await prisma.store.findUniqueOrThrow({
      where: { id: fx.storeId },
    });
    expect(store.isOnVacation).toBe(true);
    expect(store.vacationMessage).toBe("Back on July 25");
  });

  it("clears the message when vacation is turned off", async () => {
    authMock.mockResolvedValue({ user: { id: fx.sellerUserId } });
    await setVacation(false);
    const store = await prisma.store.findUniqueOrThrow({
      where: { id: fx.storeId },
    });
    expect(store.isOnVacation).toBe(false);
    expect(store.vacationMessage).toBeNull();
  });

  it("sets then clears the auto-reply", async () => {
    authMock.mockResolvedValue({ user: { id: fx.sellerUserId } });
    await setAutoReply("We reply within a day.");
    let store = await prisma.store.findUniqueOrThrow({
      where: { id: fx.storeId },
    });
    expect(store.autoReplyMessage).toBe("We reply within a day.");
    await setAutoReply("   ");
    store = await prisma.store.findUniqueOrThrow({ where: { id: fx.storeId } });
    expect(store.autoReplyMessage).toBeNull();
  });

  it("rejects a non-seller", async () => {
    authMock.mockResolvedValue({ user: { id: fx.buyerId } });
    expect((await setVacation(true)).error).toBe("forbidden");
    expect((await setAutoReply("x")).error).toBe("forbidden");
  });
});

describe("importProductsCsv", () => {
  it("creates DRAFT products with a default variant", async () => {
    authMock.mockResolvedValue({ user: { id: fx.sellerUserId } });
    const csv = [
      "title_en,title_ar,category_slug,price,stock,description_en",
      `Imported Mouse,فأرة,${catSlug},12.5,7,Nice mouse`,
      `Imported Keyboard,لوحة,${catSlug},20,3,`,
    ].join("\n");

    const res = await importProductsCsv(csv);
    expect(res.created).toBe(2);
    expect(res.errors).toEqual([]);

    const all = await prisma.product.findMany({
      where: { storeId: fx.storeId },
      include: { variants: true },
    });
    const imported = all.filter((p) =>
      String((p.title as { en?: string }).en ?? "").startsWith("Imported"),
    );
    expect(imported).toHaveLength(2);
    for (const p of imported) {
      expect(p.status).toBe("DRAFT");
      expect(p.variants).toHaveLength(1);
      expect(p.variants[0].name).toBe("Default");
    }
    const mouse = imported.find(
      (p) => (p.title as { en?: string }).en === "Imported Mouse",
    )!;
    expect(Number(mouse.basePrice)).toBe(12.5);
    expect(mouse.variants[0].stock).toBe(7);
  });

  it("rejects a header missing required columns", async () => {
    authMock.mockResolvedValue({ user: { id: fx.sellerUserId } });
    expect((await importProductsCsv("foo,bar\n1,2")).error).toBe("badHeader");
  });

  it("reports per-row errors without creating those rows", async () => {
    authMock.mockResolvedValue({ user: { id: fx.sellerUserId } });
    const csv = [
      "title_en,category_slug,price",
      `,${catSlug},10`, // missing title
      `Ghost,does-not-exist,10`, // unknown category
      `Priceless,${catSlug},abc`, // invalid price
    ].join("\n");
    const res = await importProductsCsv(csv);
    expect(res.created).toBe(0);
    expect(res.errors).toHaveLength(3);
  });

  it("rejects a non-seller", async () => {
    authMock.mockResolvedValue({ user: { id: fx.buyerId } });
    expect(
      (await importProductsCsv("title_en,category_slug,price\n")).error,
    ).toBe("forbidden");
  });
});

describe("chat auto-reply", () => {
  let conversationId: string;

  beforeAll(async () => {
    await prisma.store.update({
      where: { id: fx.storeId },
      data: { autoReplyMessage: "Thanks! We reply within 24h." },
    });
    const conv = await prisma.conversation.create({
      data: { buyerId: fx.buyerId, storeId: fx.storeId },
    });
    conversationId = conv.id;
  });

  afterAll(async () => {
    await prisma.message.deleteMany({ where: { conversationId } });
    await prisma.conversation
      .delete({ where: { id: conversationId } })
      .catch(() => {});
    await prisma.store.update({
      where: { id: fx.storeId },
      data: { autoReplyMessage: null },
    });
  });

  it("fires the canned reply after the buyer's first message", async () => {
    authMock.mockResolvedValue({ user: { id: fx.buyerId } });
    const res = await sendMessage(conversationId, "Hi, is this in stock?");
    expect(res.ok).toBe(true);

    const msgs = await prisma.message.findMany({ where: { conversationId } });
    expect(msgs).toHaveLength(2);
    const buyerMsg = msgs.find((m) => m.senderId === fx.buyerId);
    const sellerMsg = msgs.find((m) => m.senderId === fx.sellerUserId);
    expect(buyerMsg?.body).toBe("Hi, is this in stock?");
    expect(sellerMsg?.body).toContain("24h");
  });

  it("does not fire again on the buyer's later messages", async () => {
    authMock.mockResolvedValue({ user: { id: fx.buyerId } });
    await sendMessage(conversationId, "Any update?");
    const sellerMsgs = await prisma.message.count({
      where: { conversationId, senderId: fx.sellerUserId },
    });
    expect(sellerMsgs).toBe(1);
  });
});
