import { Wallet } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { loadReceiptByToken } from "@/lib/wallet-receipt";
import { ReceiptView } from "@/components/wallet/receipt-view";

export const dynamic = "force-dynamic";

// Public, no-auth receipt resolved by an unguessable token. Shows only the one
// shared transaction — the owner chose to share it as proof of payment.
export default async function PublicReceiptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const t = await getTranslations("Wallet");
  const receipt = await loadReceiptByToken(token);

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <span className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-full">
          <Wallet className="size-6" />
        </span>
        <p className="text-muted-foreground text-sm">
          {t("receiptPublicNote")}
        </p>
      </div>

      {receipt ? (
        <ReceiptView receipt={receipt} />
      ) : (
        <p className="text-muted-foreground text-center text-sm">
          {t("txNotFound")}
        </p>
      )}
    </main>
  );
}
