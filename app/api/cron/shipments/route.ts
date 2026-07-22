import { NextResponse } from "next/server";

import { sweepStuckShipments } from "@/lib/shipment-sweep";

// Scheduled endpoint (e.g. Vercel Cron / host crontab) that flags shipments
// stuck past the threshold and alerts delivery staff. Protected by
// CRON_SECRET; one-shot guards on Shipment make re-runs harmless.
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
  const result = await sweepStuckShipments();
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(req: Request) {
  return run(req);
}
export async function POST(req: Request) {
  return run(req);
}
