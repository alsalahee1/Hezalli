import { NextResponse } from "next/server";

import { remindAbandonedCarts } from "@/lib/marketing";

// Scheduled endpoint (e.g. Vercel Cron) that sends abandoned-cart reminders.
// Protected by CRON_SECRET. Idempotent per cart via the remindedAt guard, so
// running it more often than needed is harmless.
export const dynamic = "force-dynamic";

async function run(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const reminded = await remindAbandonedCarts();
  return NextResponse.json({ ok: true, reminded });
}

export async function GET(req: Request) {
  return run(req);
}
export async function POST(req: Request) {
  return run(req);
}
