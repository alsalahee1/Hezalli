import { redirect } from "next/navigation";
import { HandCoins } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { walletHasPin } from "@/lib/wallet-pin";
import { walletHasPasskey } from "@/lib/webauthn";

export const dynamic = "force-dynamic";

export default async function PayRequestPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = await params;
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user?.id) {
    redirect(`/${locale}/login?callbackUrl=/${locale}/pay/r/${requestId}`);
  }
  const t = await getTranslations("Wallet");
  const format = await getFormatter();

  const req = await prisma.walletPaymentRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      amountUsd: true,
      note: true,
      status: true,
      requesterId: true,
    },
  });

  const requester = req
    ? await prisma.user.findUnique({
        where: { id: req.requesterId },
        select: { name: true, email: true },
      })
    : null;

  const { PayRequestButton } =
    await import("@/components/wallet/pay-request-button");

  const shell = (children: React.ReactNode) => (
    <main className="mx-auto max-w-md px-4 py-10">
      {/* Native-app wallet treatment on phones: hides the storefront chrome
          (announcement, header, footer) so the pay flow reads like a
          standalone wallet screen. Desktop is unaffected. */}
      <div data-native-wallet hidden />
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <span className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-full">
          <HandCoins className="size-6" />
        </span>
        <h1 className="text-xl font-semibold tracking-tight">
          {t("requestPayTitle")}
        </h1>
      </div>
      {children}
    </main>
  );

  if (!req) {
    return shell(
      <p className="text-muted-foreground text-center text-sm">
        {t("err_notFound")}
      </p>,
    );
  }

  const amountLabel = format.number(Number(req.amountUsd), {
    style: "currency",
    currency: "USD",
  });
  const who = requester?.name || requester?.email || "—";

  if (req.status !== "PENDING") {
    return shell(
      <p className="text-muted-foreground text-center text-sm">
        {req.status === "PAID"
          ? t("requestAlreadyPaid")
          : t("requestCancelled")}
      </p>,
    );
  }
  if (req.requesterId === session.user.id) {
    return shell(
      <p className="text-muted-foreground text-center text-sm">
        {t("requestOwn")}
      </p>,
    );
  }

  const [hasPin, hasPasskey] = await Promise.all([
    walletHasPin(session.user.id),
    walletHasPasskey(session.user.id),
  ]);

  return shell(
    <div className="space-y-4">
      <div className="rounded-lg border p-4 text-center">
        <p className="text-muted-foreground text-sm">
          {t("requestFrom", { name: who })}
        </p>
        <p className="text-2xl font-bold" dir="ltr">
          {amountLabel}
        </p>
        {req.note ? (
          <p className="text-muted-foreground mt-1 text-sm">{req.note}</p>
        ) : null}
      </div>
      <PayRequestButton
        requestId={req.id}
        amountLabel={amountLabel}
        hasPin={hasPin}
        hasPasskey={hasPasskey}
      />
    </div>,
  );
}
