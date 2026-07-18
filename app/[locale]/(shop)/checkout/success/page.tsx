import { CheckCircle2 } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user?.id) redirect(`/${locale}/login`);
  const { order: orderId } = await searchParams;
  if (!orderId) notFound();

  const order = await prisma.order.findFirst({
    where: { id: orderId, buyerId: session.user.id },
    select: {
      id: true,
      grandTotal: true,
      createdAt: true,
      subOrders: {
        select: {
          store: { select: { name: true } },
          _count: { select: { items: true } },
        },
      },
    },
  });
  if (!order) notFound();

  const t = await getTranslations("Checkout");
  const format = await getFormatter();
  const itemCount = order.subOrders.reduce((n, s) => n + s._count.items, 0);

  return (
    <main className="mx-auto max-w-lg px-4 py-16 text-center">
      <CheckCircle2 className="mx-auto mb-4 size-14 text-emerald-500" />
      <h1 className="text-2xl font-semibold tracking-tight">
        {t("successTitle")}
      </h1>
      <p className="text-muted-foreground mt-1">{t("successBody")}</p>

      <div className="mt-6 rounded-lg border p-4 text-start text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("orderNumber")}</span>
          <span className="font-mono">#{order.id.slice(-8).toUpperCase()}</span>
        </div>
        <div className="mt-1 flex justify-between">
          <span className="text-muted-foreground">{t("items")}</span>
          <span>{itemCount}</span>
        </div>
        <div className="mt-1 flex justify-between">
          <span className="text-muted-foreground">{t("sellers")}</span>
          <span>{order.subOrders.length}</span>
        </div>
        <div className="mt-1 flex justify-between font-semibold">
          <span>{t("grandTotal")}</span>
          <span dir="ltr">
            {format.number(Number(order.grandTotal), {
              style: "currency",
              currency: "USD",
            })}
          </span>
        </div>
      </div>

      <div className="mt-6 flex justify-center gap-3">
        <Button asChild>
          <Link href="/account/orders">{t("viewOrders")}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">{t("continueShopping")}</Link>
        </Button>
      </div>
    </main>
  );
}
