import { NextResponse } from "next/server";

import { requireCourierId } from "@/lib/authz";
import { courierStatement } from "@/lib/courier-statement";
import { monthRange, statementCsv } from "@/lib/point-statement";

// CSV export of the driver's monthly statement (docs §30). Courier-gated:
// always the AUTHENTICATED driver's own ledger.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const courierId = await requireCourierId();
  if (!courierId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const { from, to, key } = monthRange(searchParams.get("month"));
  const stmt = await courierStatement(courierId, from, to);
  return new NextResponse(statementCsv(stmt.entries), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="hezalli-driver-statement-${key}.csv"`,
    },
  });
}
