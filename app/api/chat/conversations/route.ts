import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Conversation list + per-conversation and total unread counts for the current
// user (as buyer or seller). Polled by the chat UI and the header badge.
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ unread: 0, items: [] });
  }
  const userId = session.user.id;

  const conversations = await prisma.conversation.findMany({
    where: {
      OR: [{ buyerId: userId }, { store: { seller: { userId } } }],
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: {
      id: true,
      buyerId: true,
      updatedAt: true,
      buyer: { select: { name: true } },
      store: {
        select: { name: true, seller: { select: { userId: true } } },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, attachments: true, createdAt: true },
      },
    },
  });

  const ids = conversations.map((c) => c.id);
  const unreadRows = ids.length
    ? await prisma.message.groupBy({
        by: ["conversationId"],
        where: {
          conversationId: { in: ids },
          senderId: { not: userId },
          readAt: null,
        },
        _count: { _all: true },
      })
    : [];
  const unreadByConv = new Map(
    unreadRows.map((r) => [r.conversationId, r._count._all]),
  );

  const items = conversations.map((c) => {
    const last = c.messages[0];
    const atts = (last?.attachments as string[] | null) ?? [];
    return {
      id: c.id,
      otherName:
        c.buyerId === userId ? c.store.name : (c.buyer.name ?? "Buyer"),
      lastBody: last ? last.body || (atts.length ? "📷" : "") : "",
      lastAt: last?.createdAt ?? c.updatedAt,
      unread: unreadByConv.get(c.id) ?? 0,
    };
  });
  const unread = items.reduce((s, i) => s + i.unread, 0);

  return NextResponse.json({ unread, items });
}
