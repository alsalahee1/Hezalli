import { NextResponse } from "next/server";

import { requireDeliveryPoint } from "@/lib/authz";
import {
  monthRange,
  pointStatement,
  statementCsv,
} from "@/lib/point-statement";

// CSV export of the hub's monthly statement (docs §28). Operator-gated: the
// statement is always the AUTHENTICATED operator's own hub.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const gate = await requireDeliveryPoint();
  if (!gate) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const { from, to, key } = monthRange(searchParams.get("month"));
  const stmt = await pointStatement(gate.pointId, from, to);
  return new NextResponse(statementCsv(stmt.entries), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="hezalli-point-statement-${key}.csv"`,
    },
  });
}
