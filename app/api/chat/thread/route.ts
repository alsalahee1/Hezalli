import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Messages for one conversation, optionally only those newer than `after`
// (ISO timestamp) for incremental polling. Verifies the caller participates.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const url = new URL(req.url);
  const conversationId = url.searchParams.get("id") ?? "";
  const after = url.searchParams.get("after");

  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      buyerId: true,
      store: { select: { name: true, seller: { select: { userId: true } } } },
    },
  });
  if (!conv) {
    return NextResponse.json({ error: "notFound" }, { status: 404 });
  }
  const sellerUserId = conv.store.seller.userId;
  if (userId !== conv.buyerId && userId !== sellerUserId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const messages = await prisma.message.findMany({
    where: {
      conversationId,
      ...(after ? { createdAt: { gt: new Date(after) } } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: {
      id: true,
      senderId: true,
      body: true,
      attachments: true,
      readAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    me: userId,
    otherName: userId === conv.buyerId ? conv.store.name : "Buyer",
    messages,
  });
}
