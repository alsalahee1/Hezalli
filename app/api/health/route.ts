import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

// Lightweight health check for uptime monitors (UptimeRobot etc.) and load
// balancers. Verifies the process is up and the database is reachable.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      db: "up",
      time: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      { status: "degraded", db: "down" },
      { status: 503 },
    );
  }
}
