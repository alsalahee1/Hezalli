import { redirect } from "next/navigation";
import { Gift } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import {
  generateReferralCode,
  POINTS_PER_USD_REDEEMED,
  pointsToUsd,
} from "@/lib/loyalty";
import { prisma } from "@/lib/prisma";
import { abs } from "@/lib/seo";
import { ReferralLink } from "@/components/account/referral-link";

export const dynamic = "force-dynamic";

const TXN_LABEL: Record<string, string> = {
  EARN: "earn",
  REDEEM: "redeem",
  REFERRAL: "referralBonus",
  REFUND: "refund",
  ADJUST: "adjust",
};

export default async function LoyaltyPage() {
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user?.id) {
    redirect(`/${locale}/login?callbackUrl=/${locale}/account/loyalty`);
  }
  const userId = session.user.id;
  const t = await getTranslations("Loyalty");
  const format = await getFormatter();

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { loyaltyPoints: true, referralCode: true },
  });
  // Backfill a referral code for accounts created before loyalty shipped.
  let code = user.referralCode;
  if (!code) {
    code = generateReferralCode();
    await prisma.user.update({
      where: { id: userId },
      data: { referralCode: code },
    });
  }

  const [txns, referrals] = await Promise.all([
    prisma.loyaltyTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.user.count({ where: { referredById: userId } }),
  ]);

  const referralUrl = abs(locale, `/register?ref=${code}`);

  return (
    <div className="space-y-6">
      <div className="from-primary/10 flex items-center gap-4 rounded-xl border bg-gradient-to-br to-transparent p-5">
        <Gift className="text-primary size-8 shrink-0" />
        <div>
          <p className="text-muted-foreground text-sm">{t("balance")}</p>
          <p className="text-2xl font-semibold">
            {t("points", { count: user.loyaltyPoints })}
          </p>
          <p className="text-muted-foreground text-xs" dir="ltr">
            ≈{" "}
            {format.number(pointsToUsd(user.loyaltyPoints), {
              style: "currency",
              currency: "USD",
            })}{" "}
            · {t("rate", { n: POINTS_PER_USD_REDEEMED })}
          </p>
        </div>
      </div>

      <section className="space-y-3 rounded-lg border p-5">
        <div>
          <h2 className="font-medium">{t("referral")}</h2>
          <p className="text-muted-foreground text-sm">{t("referralDesc")}</p>
        </div>
        <ReferralLink
          url={referralUrl}
          copyLabel={t("copy")}
          copiedLabel={t("copied")}
        />
        <p className="text-muted-foreground text-xs">
          {t("referralsCount", { count: referrals })}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">{t("history")}</h2>
        {txns.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {txns.map((tx) => (
              <li
                key={tx.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {t(TXN_LABEL[tx.type] ?? "adjust")}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {format.dateTime(tx.createdAt, { dateStyle: "medium" })}
                  </p>
                </div>
                <span
                  className={
                    tx.points >= 0
                      ? "font-semibold text-emerald-600"
                      : "text-destructive font-semibold"
                  }
                  dir="ltr"
                >
                  {tx.points >= 0 ? "+" : ""}
                  {tx.points}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
