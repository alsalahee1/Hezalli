import { NextResponse } from "next/server";

import { getTrackingSnapshot } from "@/lib/track";

export const runtime = "nodejs";

// Live courier position for the public tracking page (one-shot JSON). Kept as a
// fallback for clients without EventSource; the SSE stream at ../stream is the
// primary transport. PRIVACY + the read model live in lib/track.ts.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ tracking: string }> },
) {
  const { tracking } = await params;
  const snap = await getTrackingSnapshot(decodeURIComponent(tracking));
  return NextResponse.json(
    { driver: snap.driver, dest: snap.dest },
    { headers: { "Cache-Control": "no-store" } },
  );
}
