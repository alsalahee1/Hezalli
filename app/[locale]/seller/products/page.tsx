import { Plus } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import { localizedName } from "@/lib/categories";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export default async function SellerProductsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const profile = await prisma.sellerProfile.findUnique({
    where: { userId: session.user.id },
    select: { store: { select: { id: true } } },
  });
  const storeId = profile?.store?.id;
  if (!storeId) return null;

  const products = await prisma.product.findMany({
    where: { storeId, status: { not: "REMOVED" } },
    orderBy: { updatedAt: "desc" },
    include: {
      images: { orderBy: { position: "asc" }, take: 1 },
      variants: { select: { price: true, stock: true } },
    },
  });
  const locale = await getLocale();
  const format = await getFormatter();
  const t = await getTranslations("SellerProducts");

  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

  const statusBadge: Record<string, string> = {
    DRAFT: "bg-muted text-muted-foreground",
    ACTIVE: "bg-emerald-500/15 text-emerald-600",
    HIDDEN: "bg-amber-500/15 text-amber-600",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-muted-foreground text-sm">{t("listDesc")}</p>
        </div>
        <Button asChild>
          <Link href="/seller/products/new">
            <Plus className="size-4" />
            {t("newProduct")}
          </Link>
        </Button>
      </div>

      {products.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed py-14 text-center text-sm">
          {t("empty")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="px-3 py-2 text-start font-medium">
                  {t("product")}
                </th>
                <th className="px-3 py-2 text-start font-medium">
                  {t("price")}
                </th>
                <th className="px-3 py-2 text-start font-medium">
                  {t("stock")}
                </th>
                <th className="px-3 py-2 text-start font-medium">
                  {t("statusCol")}
                </th>
                <th className="px-3 py-2 text-start font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const prices = p.variants.map((v) => Number(v.price));
                const min = prices.length ? Math.min(...prices) : 0;
                const max = prices.length ? Math.max(...prices) : 0;
                const stock = p.variants.reduce((s, v) => s + v.stock, 0);
                const title = (p.title ?? {}) as Record<string, string>;
                return (
                  <tr key={p.id} className="border-t">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-3">
                        <div className="bg-muted size-10 shrink-0 overflow-hidden rounded">
                          {p.images[0] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={p.images[0].url}
                              alt=""
                              className="size-full object-cover"
                            />
                          ) : null}
                        </div>
                        <span className="font-medium">
                          {localizedName(title, locale)}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap" dir="ltr">
                      {min === max
                        ? money(min)
                        : `${money(min)} – ${money(max)}`}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          stock === 0 && "text-destructive font-medium",
                        )}
                      >
                        {stock}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-xs font-medium",
                          statusBadge[p.status] ?? "bg-muted",
                        )}
                      >
                        {t(`status_${p.status}`)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-end">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/seller/products/${p.id}/edit`}>
                          {t("edit")}
                        </Link>
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
