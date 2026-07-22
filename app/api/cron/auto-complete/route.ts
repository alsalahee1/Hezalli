import { NextResponse } from "next/server";

import { autoCompleteDeliveredOrders } from "@/lib/actions/completion";
import { expireStaleOrders } from "@/lib/actions/payment";
import { autoApproveReturns } from "@/lib/actions/return";
import { sweepStuckShipments } from "@/lib/shipment-sweep";

// Scheduled endpoint (e.g. Vercel Cron) that completes delivered orders past
// their grace window. Protected by CRON_SECRET; the same work also runs lazily
// on buyer order page loads, so this is a belt-and-braces safety net.
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
  const [completed, autoApproved, expired, stuck] = await Promise.all([
    autoCompleteDeliveredOrders(),
    autoApproveReturns(),
    expireStaleOrders(),
    sweepStuckShipments(),
  ]);
  return NextResponse.json({
    ok: true,
    completed,
    autoApproved,
    expired,
    stuckFlagged: stuck.flagged,
  });
}

export async function GET(req: Request) {
  return run(req);
}
export async function POST(req: Request) {
  return run(req);
}
