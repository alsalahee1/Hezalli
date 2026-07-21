import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// Store (or re-point) a browser push subscription for the signed-in user.
// Keyed by endpoint (unique) so re-subscribing the same device is idempotent.
export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let sub: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  try {
    sub = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const endpoint = sub.endpoint;
  const p256dh = sub.keys?.p256dh;
  const authKey = sub.keys?.auth;
  if (!endpoint || !p256dh || !authKey) {
    return NextResponse.json({ error: "bad_subscription" }, { status: 400 });
  }

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { userId, endpoint, p256dh, auth: authKey },
    update: { userId, p256dh, auth: authKey },
  });

  return NextResponse.json({ ok: true });
}
