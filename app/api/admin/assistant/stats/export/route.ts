import { NextResponse, type NextRequest } from "next/server";

import { buildQuestionsCsv } from "@/lib/ai/stats";
import { requireAdminId } from "@/lib/authz";

export const dynamic = "force-dynamic";

const RANGES = [7, 30, 90];

// Admin-only CSV export of assistant questions (per character, asked +
// unanswered counts) over the selected window.
export async function GET(req: NextRequest) {
  const adminId = await requireAdminId();
  if (!adminId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const d = Number(req.nextUrl.searchParams.get("days"));
  const days = RANGES.includes(d) ? d : 30;

  const csv = await buildQuestionsCsv(days, Date.now());
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="assistant-questions-${days}d.csv"`,
      "cache-control": "no-store",
    },
  });
}
