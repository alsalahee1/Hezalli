import { NextResponse } from "next/server";

import { requireWalletManagerId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

// CSV export of the money desk's processed history: top-ups and withdrawals
// with their outcomes and reviewer. Capped at 5000 rows per section.
export const dynamic = "force-dynamic";

function csvCell(v: string | null | undefined): string {
  const s = v ?? "";
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const staffId = await requireWalletManagerId();
  if (!staffId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const [topUps, withdrawals] = await Promise.all([
    prisma.walletTopUp.findMany({
      where: { status: { in: ["CONFIRMED", "REJECTED"] } },
      orderBy: { createdAt: "desc" },
      take: 5000,
      select: {
        id: true,
        amountUsd: true,
        method: true,
        status: true,
        reference: true,
        reviewedBy: true,
        reviewNote: true,
        createdAt: true,
        confirmedAt: true,
        wallet: { select: { user: { select: { name: true, email: true } } } },
      },
    }),
    prisma.walletWithdrawal.findMany({
      where: { status: { in: ["PAID", "REJECTED"] } },
      orderBy: { createdAt: "desc" },
      take: 5000,
      select: {
        id: true,
        amountUsd: true,
        method: true,
        status: true,
        reviewedBy: true,
        reviewNote: true,
        createdAt: true,
        processedAt: true,
        wallet: { select: { user: { select: { name: true, email: true } } } },
      },
    }),
  ]);

  const reviewerIds = [
    ...new Set(
      [...topUps, ...withdrawals]
        .map((r) => r.reviewedBy)
        .filter((v): v is string => !!v),
    ),
  ];
  const reviewers = reviewerIds.length
    ? await prisma.user.findMany({
        where: { id: { in: reviewerIds } },
        select: { id: true, name: true },
      })
    : [];
  const reviewerName = new Map(reviewers.map((u) => [u.id, u.name ?? u.id]));

  const header = [
    "kind",
    "id",
    "user",
    "email",
    "method",
    "amount_usd",
    "status",
    "reference_or_note",
    "reviewed_by",
    "requested_at",
    "processed_at",
  ].join(",");

  const lines = [
    ...topUps.map((r) =>
      [
        "topup",
        r.id,
        csvCell(r.wallet.user.name),
        csvCell(r.wallet.user.email),
        r.method,
        String(r.amountUsd),
        r.status,
        csvCell(r.reference ?? r.reviewNote),
        csvCell(r.reviewedBy ? reviewerName.get(r.reviewedBy) : ""),
        r.createdAt.toISOString(),
        r.confirmedAt?.toISOString() ?? "",
      ].join(","),
    ),
    ...withdrawals.map((r) =>
      [
        "withdrawal",
        r.id,
        csvCell(r.wallet.user.name),
        csvCell(r.wallet.user.email),
        r.method,
        String(r.amountUsd),
        r.status,
        csvCell(r.reviewNote),
        csvCell(r.reviewedBy ? reviewerName.get(r.reviewedBy) : ""),
        r.createdAt.toISOString(),
        r.processedAt?.toISOString() ?? "",
      ].join(","),
    ),
  ];

  return new NextResponse([header, ...lines].join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="wallet-history.csv"',
    },
  });
}
