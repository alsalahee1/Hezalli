import { NextResponse } from "next/server";

// The VAPID public key the browser needs to create a push subscription. Served
// from server env (no rebuild needed to set it). 204 when push is not
// configured, so the client can hide the toggle.
export function GET() {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return new NextResponse(null, { status: 204 });
  return NextResponse.json({ key });
}
