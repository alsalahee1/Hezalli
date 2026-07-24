import { NextResponse } from "next/server";

import { sendWeeklyDigest } from "@/lib/ai/digest";

// Scheduled endpoint that sends the weekly assistant-stats digest to the
// owner's Telegram. Protected by CRON_SECRET. Point a weekly scheduler here
// (e.g. Sunday) — it no-ops unless the digest is enabled with a chat id set.
export const dynamic = "force-dynamic";

async function run(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await sendWeeklyDigest(Date.now());
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(req: Request) {
  return run(req);
}
export async function POST(req: Request) {
  return run(req);
}
