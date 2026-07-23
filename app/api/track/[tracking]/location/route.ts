import { NextResponse } from "next/server";

import { rateLimitAsync } from "@/lib/rate-limit";
import { getTrackingSnapshot } from "@/lib/track";

export const runtime = "nodejs";

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (
    fwd?.split(",")[0] ||
    req.headers.get("x-real-ip") ||
    "unknown"
  ).trim();
}

// Live courier position for the public tracking page (one-shot JSON). Kept as a
// fallback for clients without EventSource; the SSE stream at ../stream is the
// primary transport. PRIVACY + the read model live in lib/track.ts.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ tracking: string }> },
) {
  // Throttle enumeration of tracking numbers (which map to buyer PII/location).
  if (!(await rateLimitAsync(`track:${clientIp(req)}`, 60, 60_000)).ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const { tracking } = await params;
  const snap = await getTrackingSnapshot(decodeURIComponent(tracking));
  return NextResponse.json(
    { driver: snap.driver, dest: snap.dest },
    { headers: { "Cache-Control": "no-store" } },
  );
}
