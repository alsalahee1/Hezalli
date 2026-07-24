import type { Metadata } from "next";
import { QrCode, Store, Wallet } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { Link, redirect } from "@/i18n/navigation";
import { BecomeMerchantForm } from "@/components/merchant/become-merchant-form";
import { Button } from "@/components/ui/button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("MerchantApply");
  return { title: t("title") };
}

const BENEFITS = [
  { icon: Wallet, key: "benefitInstant" },
  { icon: QrCode, key: "benefitQr" },
  { icon: Store, key: "benefitSimple" },
] as const;

// "Become a HezalliPay merchant" — the payments-merchant equivalent of
// /point-partner, and NOT auto-approved. Submitting files a request; an admin
// reviews it and grants the MERCHANT role + creates the profile (see
// lib/actions/merchant-application.ts). Whole flow is licensed-gated.
export default async function MerchantApplyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Licensed-gated: if merchant payments are off, the flow doesn't exist yet.
  if (!(await getSetting("merchant_payments_enabled"))) {
    redirect({ href: "/", locale });
  }

  const session = await auth();
  let application: { status: string } | null = null;
  let defaults = { fullName: "", phone: "" };
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        roles: true,
        name: true,
        phone: true,
        merchantApplication: { select: { status: true } },
      },
    });
    // Already a merchant → straight to the merchant app.
    if (user?.roles.includes("MERCHANT")) {
      redirect({ href: "/merchant", locale });
    }
    application = user?.merchantApplication ?? null;
    defaults = { fullName: user?.name ?? "", phone: user?.phone ?? "" };
  }

  const t = await getTranslations("MerchantApply");
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
                query: { callbackUrl: `/${locale}/merchant-apply` },
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
          <BecomeMerchantForm
            defaultFullName={defaults.fullName}
            defaultPhone={defaults.phone}
          />
        </div>
      )}
    </main>
  );
}
