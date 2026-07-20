import type { Metadata } from "next";
import { Banknote, PackageCheck, Store } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Link, redirect } from "@/i18n/navigation";
import { BecomePointForm } from "@/components/point/become-point-form";
import { Button } from "@/components/ui/button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("PointApply");
  return { title: t("title") };
}

const BENEFITS = [
  { icon: Banknote, key: "benefitEarn" },
  { icon: Store, key: "benefitShop" },
  { icon: PackageCheck, key: "benefitSimple" },
] as const;

// "Become a Hezalli Point" — the partner-hub equivalent of /drive, and NOT
// auto-approved. Submitting files a request; an admin reviews it and grants
// the DELIVERY_POINT role + creates the point (see
// lib/actions/point-application.ts and docs/DELIVERY-POINTS.md).
export default async function PointPartnerPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  let application: { status: string } | null = null;
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        roles: true,
        deliveryPointApplication: { select: { status: true } },
      },
    });
    // Already an operator → straight to the point app.
    if (user?.roles.includes("DELIVERY_POINT")) {
      redirect({ href: "/point", locale });
    }
    application = user?.deliveryPointApplication ?? null;
  }

  const t = await getTranslations("PointApply");
  const pending = application?.status === "PENDING";

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

      {!session?.user ? (
        <div className="space-y-3 text-center">
          <p className="text-muted-foreground text-sm">{t("signInPrompt")}</p>
          <Button asChild size="lg">
            <Link
              href={{
                pathname: "/login",
                query: { callbackUrl: `/${locale}/point-partner` },
              }}
            >
              {t("signInCta")}
            </Link>
          </Button>
        </div>
      ) : pending ? (
        <div className="mx-auto max-w-lg rounded-lg border border-amber-500/40 bg-amber-500/5 p-6 text-center">
          <h2 className="font-semibold">{t("pendingTitle")}</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {t("pendingBody")}
          </p>
        </div>
      ) : (
        <div className="mx-auto max-w-lg">
          <h2 className="mb-4 text-lg font-semibold">{t("formTitle")}</h2>
          {application?.status === "REJECTED" ? (
            <p className="mb-4 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-500">
              {t("rejectedResubmit")}
            </p>
          ) : null}
          <BecomePointForm />
        </div>
      )}
    </main>
  );
}
