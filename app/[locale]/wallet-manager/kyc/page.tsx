import { getFormatter, getTranslations } from "next-intl/server";

import { prisma } from "@/lib/prisma";
import { KycReview } from "@/components/wallet-manager/kyc-review";

export const dynamic = "force-dynamic";

// KYC review queue. VERIFIED unlocks wallet cash-outs and P2P sends, so the
// money desk owns identity review.
export default async function WalletManagerKycPage() {
  const t = await getTranslations("WalletManager");
  const format = await getFormatter();

  const [pending, recent] = await Promise.all([
    prisma.sellerProfile.findMany({
      where: { kycStatus: "PENDING" },
      orderBy: { updatedAt: "asc" },
      take: 100,
      select: {
        id: true,
        kycDocs: true,
        updatedAt: true,
        user: { select: { name: true, email: true, phone: true } },
        store: { select: { name: true } },
      },
    }),
    prisma.sellerProfile.findMany({
      where: { kycStatus: { in: ["VERIFIED", "REJECTED"] } },
      orderBy: { kycReviewedAt: "desc" },
      take: 10,
      select: {
        id: true,
        kycStatus: true,
        kycReviewedAt: true,
        user: { select: { name: true } },
      },
    }),
  ]);

  const docLines = (docs: unknown): [string, string][] => {
    if (!docs || typeof docs !== "object") return [];
    return Object.entries(docs as Record<string, unknown>)
      .filter(([, v]) => typeof v === "string" && v)
      .slice(0, 8) as [string, string][];
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("kyc")}</h1>
        <p className="text-muted-foreground text-sm">{t("kycDesc")}</p>
      </div>

      {pending.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed py-10 text-center text-sm">
          {t("kycEmpty")}
        </div>
      ) : (
        <ul className="space-y-3">
          {pending.map((p) => (
            <li key={p.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 text-sm">
                  <p className="font-medium">
                    {p.user.name ?? "—"}
                    {p.store ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · {p.store.name}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {p.user.email}
                    {p.user.phone ? (
                      <span dir="ltr"> · {p.user.phone}</span>
                    ) : null}{" "}
                    · {format.dateTime(p.updatedAt, { dateStyle: "medium" })}
                  </p>
                  {docLines(p.kycDocs).length > 0 ? (
                    <dl className="mt-2 space-y-0.5 text-xs">
                      {docLines(p.kycDocs).map(([k, v]) => (
                        <div key={k} className="flex gap-2">
                          <dt className="text-muted-foreground">{k}:</dt>
                          <dd className="truncate" dir="ltr">
                            {v.startsWith("http") ? (
                              <a
                                href={v}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline"
                              >
                                {v}
                              </a>
                            ) : (
                              v
                            )}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="text-muted-foreground mt-2 text-xs italic">
                      {t("kycNoDocs")}
                    </p>
                  )}
                </div>
                <KycReview profileId={p.id} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold tracking-tight">
          {t("kycRecent")}
        </h2>
        {recent.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("none")}</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {recent.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
              >
                <span className="font-medium">{r.user.name ?? "—"}</span>
                <span
                  className={
                    r.kycStatus === "VERIFIED"
                      ? "text-xs font-medium text-emerald-600"
                      : "text-destructive text-xs font-medium"
                  }
                >
                  {t(`kyc_${r.kycStatus}`)}
                  {r.kycReviewedAt
                    ? ` · ${format.dateTime(r.kycReviewedAt, { dateStyle: "medium" })}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
