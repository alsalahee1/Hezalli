import { redirect } from "next/navigation";
import { Store } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import { getRequestDisplayCurrency } from "@/lib/currency";
import { formatMoney } from "@/lib/currency-constants";
import { prisma } from "@/lib/prisma";
import { round2 } from "@/lib/finance";
import { getSetting } from "@/lib/settings";
import { getWalletView } from "@/lib/wallet";
import { walletHasPin } from "@/lib/wallet-pin";
import { walletHasPasskey } from "@/lib/webauthn";

export const dynamic = "force-dynamic";

// Customer pay surface for a HezalliPay merchant: opened by scanning the shop's
// static QR (/pay/m/[slug]) or a charge QR (…?amount=…&note=…). Mirrors the
// pay-a-user page. Gated behind merchant_payments_enabled.
export default async function PayMerchantPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ amount?: string; note?: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user?.id) {
    redirect(`/${locale}/login?callbackUrl=/${locale}/pay/m/${slug}`);
  }
  const t = await getTranslations("Merchant");

  const shell = (children: React.ReactNode) => (
    <main className="mx-auto max-w-md px-4 py-10">
      {/* Native-app wallet treatment on phones (same as the pay-a-user page):
          hides storefront chrome so the pay flow reads like a wallet screen. */}
      <div data-native-wallet hidden />
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <span className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-full">
          <Store className="size-6" />
        </span>
        <h1 className="text-xl font-semibold tracking-tight">
          {t("payTitle")}
        </h1>
      </div>
      {children}
    </main>
  );

  if (!(await getSetting("merchant_payments_enabled"))) {
    return shell(
      <p className="text-muted-foreground text-center text-sm">
        {t("payDisabled")}
      </p>,
    );
  }

  const merchant = await prisma.merchantProfile.findUnique({
    where: { slug },
    select: {
      id: true,
      businessName: true,
      city: true,
      status: true,
      ownerId: true,
    },
  });

  if (!merchant || merchant.status !== "ACTIVE") {
    return shell(
      <p className="text-muted-foreground text-center text-sm">
        {t("payMerchantNotFound")}
      </p>,
    );
  }
  if (merchant.ownerId === session.user.id) {
    return shell(
      <p className="text-muted-foreground text-center text-sm">
        {t("payOwnShop")}
      </p>,
    );
  }

  const sp = await searchParams;
  const n = Number(sp.amount);
  const fixedAmount = Number.isFinite(n) && n > 0 ? round2(n) : null;
  const note = sp.note?.trim() || "";

  const { balance } = await getWalletView(session.user.id, 0);
  const display = await getRequestDisplayCurrency();
  const [hasPin, hasPasskey] = await Promise.all([
    walletHasPin(session.user.id),
    walletHasPasskey(session.user.id),
  ]);

  const { PayMerchantForm } =
    await import("@/components/merchant/pay-merchant-form");

  return shell(
    <div className="space-y-4">
      <div className="rounded-lg border p-4 text-center">
        <p className="text-muted-foreground text-sm">{t("payingTo")}</p>
        <p className="text-lg font-semibold">{merchant.businessName}</p>
        <p className="text-muted-foreground text-xs">{merchant.city}</p>
      </div>
      <p className="text-muted-foreground text-center text-xs">
        {t("payFromBalance", {
          balance: formatMoney(balance, display, locale),
        })}
      </p>
      <PayMerchantForm
        merchantId={merchant.id}
        merchantName={merchant.businessName}
        balance={balance}
        fixedAmount={fixedAmount}
        note={note}
        hasPin={hasPin}
        hasPasskey={hasPasskey}
      />
    </div>,
  );
}
