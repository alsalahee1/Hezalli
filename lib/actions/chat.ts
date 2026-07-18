"use server";

import { auth } from "@/auth";
import { notify } from "@/lib/notify";
import { prisma } from "@/lib/prisma";

type Result = { ok?: boolean; error?: string };

// Determine whether a user participates in a conversation, and as which side.
async function participant(
  conversationId: string,
  userId: string,
): Promise<{
  role: "buyer" | "seller";
  buyerId: string;
  sellerUserId: string;
  storeId: string;
} | null> {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      buyerId: true,
      storeId: true,
      store: { select: { seller: { select: { userId: true } } } },
    },
  });
  if (!conv) return null;
  const sellerUserId = conv.store.seller.userId;
  if (userId === conv.buyerId)
    return {
      role: "buyer",
      buyerId: conv.buyerId,
      sellerUserId,
      storeId: conv.storeId,
    };
  if (userId === sellerUserId)
    return {
      role: "seller",
      buyerId: conv.buyerId,
      sellerUserId,
      storeId: conv.storeId,
    };
  return null;
}

// Buyer opens (or reuses) their conversation with a store. Optional order
// context is attached the first time.
export async function getOrCreateConversation(
  storeId: string,
  subOrderId?: string,
): Promise<{ conversationId?: string; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "unauthorized" };
  const userId = session.user.id;

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { id: true, seller: { select: { userId: true } } },
  });
  if (!store) return { error: "notFound" };
  // A seller shouldn't open a buyer conversation with their own store.
  if (store.seller.userId === userId) return { error: "ownStore" };

  const conv = await prisma.conversation.upsert({
    where: { buyerId_storeId: { buyerId: userId, storeId } },
    create: { buyerId: userId, storeId, subOrderId: subOrderId ?? null },
    update: subOrderId ? { subOrderId } : {},
    select: { id: true },
  });
  return { conversationId: conv.id };
}

export async function sendMessage(
  conversationId: string,
  body: string,
  attachments: string[] = [],
): Promise<Result> {
  const session = await auth();
  if (!session?.user?.id) return { error: "unauthorized" };
  const userId = session.user.id;

  const text = (body ?? "").trim();
  const imgs = attachments.filter(Boolean).slice(0, 4);
  if (text.length === 0 && imgs.length === 0) return { error: "empty" };

  const p = await participant(conversationId, userId);
  if (!p) return { error: "forbidden" };

  await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId,
        senderId: userId,
        body: text,
        attachments: imgs.length ? imgs : undefined,
      },
    }),
    prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    }),
  ]);

  // Notify the recipient (email throttling arrives in Phase 12.3).
  const recipient = p.role === "buyer" ? p.sellerUserId : p.buyerId;
  const link = p.role === "buyer" ? "/seller/chat" : "/account/chat";
  await notify({
    userId: recipient,
    type: "CHAT",
    title: "New message",
    body: text ? text.slice(0, 140) : "📷 Photo",
    link,
    data: { conversationId },
    email: false,
  });

  return { ok: true };
}

// Mark the other party's messages in a conversation as read for this user.
export async function markConversationRead(
  conversationId: string,
): Promise<Result> {
  const session = await auth();
  if (!session?.user?.id) return { error: "unauthorized" };
  const userId = session.user.id;
  const p = await participant(conversationId, userId);
  if (!p) return { error: "forbidden" };

  await prisma.message.updateMany({
    where: { conversationId, senderId: { not: userId }, readAt: null },
    data: { readAt: new Date() },
  });
  return { ok: true };
}
