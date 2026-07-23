import { NextResponse } from "next/server";

import { requireDeliveryPoint } from "@/lib/authz";
import { canViewMoney } from "@/lib/point-access";
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
  // Money view only — cashiers/organizers can't export the statement.
  if (!gate || !canViewMoney(gate.access)) {
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
