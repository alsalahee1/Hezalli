import type { Metadata } from "next";
import { BadgePercent, Banknote, Store } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Link, redirect } from "@/i18n/navigation";
import { BecomeSellerForm } from "@/components/sell/become-seller-form";
import { Button } from "@/components/ui/button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Sell");
  return { title: t("title") };
}

const BENEFITS = [
  { icon: Store, key: "benefitReach" },
  { icon: Banknote, key: "benefitPayments" },
  { icon: BadgePercent, key: "benefitCommission" },
] as const;

// "Become a seller" — automatic approval (DECISIONS.md §7): submitting the
// form opens the store immediately; no admin review gate.
export default async function SellPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (session?.user?.id) {
    const profile = await prisma.sellerProfile.findUnique({
      where: { userId: session.user.id },
      select: { store: { select: { id: true } } },
    });
    // Already has a store → straight to the seller center.
    if (profile?.store) redirect({ href: "/seller", locale });
  }

  const t = await getTranslations("Sell");

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground mx-auto max-w-xl text-pretty">
          {t("subtitle")}
        </p>
      </div>

      <div className="my-8 grid gap-4 sm:grid-cols-3">
        {BENEFITS.map((b) => {
          const Icon = b.icon;
          return (
            <div
              key={b.key}
              className="bg-card text-card-foreground rounded-lg border p-4 text-center"
            >
              <Icon className="text-primary mx-auto mb-2 size-6" />
              <p className="text-sm">{t(b.key)}</p>
            </div>
          );
        })}
      </div>

      {session?.user ? (
        <div className="mx-auto max-w-lg">
          <h2 className="mb-4 text-lg font-semibold">{t("formTitle")}</h2>
          <BecomeSellerForm />
        </div>
      ) : (
        <div className="space-y-3 text-center">
          <p className="text-muted-foreground text-sm">{t("signInPrompt")}</p>
          <Button asChild size="lg">
            <Link
              href={{
                pathname: "/login",
                query: { callbackUrl: `/${locale}/sell` },
              }}
            >
              {t("signInCta")}
            </Link>
          </Button>
        </div>
      )}
    </main>
  );
}
