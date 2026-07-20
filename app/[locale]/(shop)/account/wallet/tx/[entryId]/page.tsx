import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import { Link } from "@/i18n/navigation";
import { loadReceiptForOwner } from "@/lib/wallet-receipt";
import { ReceiptView } from "@/components/wallet/receipt-view";
import { ShareReceiptButton } from "@/components/wallet/share-receipt-button";

export const dynamic = "force-dynamic";

export default async function WalletTxPage({
  params,
}: {
  params: Promise<{ entryId: string }>;
}) {
  const { entryId } = await params;
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user?.id) {
    redirect(
      `/${locale}/login?callbackUrl=/${locale}/account/wallet/tx/${entryId}`,
    );
  }
  const t = await getTranslations("Wallet");
  const receipt = await loadReceiptForOwner(entryId, session.user.id);

  return (
    <div className="mx-auto max-w-md space-y-5">
      {/* Native-app wallet treatment on phones: this marker drives the CSS in
          globals.css that hides the storefront chrome (announcement, header,
          footer, account heading + nav) on mobile so the transaction receipt
          reads like a standalone wallet screen — matching /account/wallet.
          Desktop is unaffected. */}
      <div data-native-wallet hidden />

      <Link
        href="/account/wallet"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" />
        {t("backToWallet")}
      </Link>

      <h1 className="text-xl font-semibold tracking-tight">
        {t("txDetailTitle")}
      </h1>

      {receipt ? (
        <>
          <ReceiptView receipt={receipt} />
          {receipt.note ? (
            <p className="text-muted-foreground rounded-lg border p-3 text-sm">
              {receipt.note}
            </p>
          ) : null}
          <ShareReceiptButton entryId={receipt.entryId} />
        </>
      ) : (
        <p className="text-muted-foreground text-sm">{t("txNotFound")}</p>
      )}
    </div>
  );
}
