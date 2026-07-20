import { redirect } from "next/navigation";
import { Wallet } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getWalletView } from "@/lib/wallet";
import { walletHasPin } from "@/lib/wallet-pin";

export const dynamic = "force-dynamic";

export default async function PayUserPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user?.id) {
    redirect(`/${locale}/login?callbackUrl=/${locale}/pay/u/${userId}`);
  }
  const t = await getTranslations("Wallet");
  const format = await getFormatter();

  const recipient = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, deletedAt: true },
  });

  const { PayUserForm } = await import("@/components/wallet/pay-user-form");

  const shell = (children: React.ReactNode) => (
    <main className="mx-auto max-w-md px-4 py-10">
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <span className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-full">
          <Wallet className="size-6" />
        </span>
        <h1 className="text-xl font-semibold tracking-tight">
          {t("payTitle")}
        </h1>
      </div>
      {children}
    </main>
  );

  if (!recipient || recipient.deletedAt) {
    return shell(
      <p className="text-muted-foreground text-center text-sm">
        {t("err_recipientNotFound")}
      </p>,
    );
  }
  if (recipient.id === session.user.id) {
    return shell(
      <p className="text-muted-foreground text-center text-sm">
        {t("payOwnCode")}
      </p>,
    );
  }

  const name = recipient.name || recipient.email || "—";
  const { balance } = await getWalletView(session.user.id, 0);
  const hasPin = await walletHasPin(session.user.id);

  return shell(
    <div className="space-y-4">
      <div className="rounded-lg border p-4 text-center">
        <p className="text-muted-foreground text-sm">{t("payingTo")}</p>
        <p className="text-lg font-semibold">{name}</p>
      </div>
      <p className="text-muted-foreground text-center text-xs">
        {t("payFromBalance", {
          balance: format.number(balance, {
            style: "currency",
            currency: "USD",
          }),
        })}
      </p>
      <PayUserForm
        recipientId={recipient.id}
        recipientName={name}
        balance={balance}
        hasPin={hasPin}
      />
    </div>,
  );
}
