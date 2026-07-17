import { getFormatter, getTranslations } from "next-intl/server";

import { setStoreStatus } from "@/lib/actions/seller";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Admin oversight of sellers (post-moderation model, DECISIONS.md §7):
// sellers onboard automatically, so this screen lists stores with their KYC
// state and lets an admin suspend / reactivate abusive ones. KYC review
// itself arrives with payouts (Phase 9).
export default async function AdminSellersPage() {
  const t = await getTranslations("AdminSellers");
  const format = await getFormatter();

  const stores = await prisma.store.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      seller: {
        select: {
          kycStatus: true,
          user: { select: { name: true, email: true } },
        },
      },
      _count: { select: { products: true } },
    },
  });

  const kycBadge: Record<string, string> = {
    NONE: "bg-muted text-muted-foreground",
    PENDING: "bg-amber-500/15 text-amber-600",
    VERIFIED: "bg-emerald-500/15 text-emerald-600",
    REJECTED: "bg-destructive/10 text-destructive",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("desc")}</p>
      </div>

      {stores.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="px-3 py-2 text-start font-medium">
                  {t("store")}
                </th>
                <th className="px-3 py-2 text-start font-medium">
                  {t("seller")}
                </th>
                <th className="px-3 py-2 text-start font-medium">{t("kyc")}</th>
                <th className="px-3 py-2 text-start font-medium">
                  {t("products")}
                </th>
                <th className="px-3 py-2 text-start font-medium">
                  {t("created")}
                </th>
                <th className="px-3 py-2 text-start font-medium">
                  {t("status")}
                </th>
                <th className="px-3 py-2 text-start font-medium">
                  {t("actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {stores.map((s) => {
                const suspended = s.status === "SUSPENDED";
                return (
                  <tr key={s.id} className="border-t align-top">
                    <td className="px-3 py-3">
                      <p className="font-medium">{s.name}</p>
                      <p className="text-muted-foreground text-xs">/{s.slug}</p>
                    </td>
                    <td className="px-3 py-3">
                      <p>{s.seller.user.name ?? "—"}</p>
                      <p className="text-muted-foreground text-xs">
                        {s.seller.user.email}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-xs font-medium",
                          kycBadge[s.seller.kycStatus],
                        )}
                      >
                        {t(`kyc_${s.seller.kycStatus}`)}
                      </span>
                    </td>
                    <td className="px-3 py-3">{s._count.products}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {format.dateTime(s.createdAt, { dateStyle: "medium" })}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-xs font-medium",
                          suspended
                            ? "bg-destructive/10 text-destructive"
                            : "bg-emerald-500/15 text-emerald-600",
                        )}
                      >
                        {t(`status_${s.status}`)}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <form action={setStoreStatus} className="flex gap-2">
                        <input type="hidden" name="storeId" value={s.id} />
                        <input
                          type="hidden"
                          name="status"
                          value={suspended ? "ACTIVE" : "SUSPENDED"}
                        />
                        {!suspended ? (
                          <Input
                            name="reason"
                            placeholder={t("reasonPlaceholder")}
                            className="h-8 w-40 text-xs"
                          />
                        ) : null}
                        <Button
                          type="submit"
                          size="sm"
                          variant={suspended ? "outline" : "destructive"}
                        >
                          {suspended ? t("reactivate") : t("suspend")}
                        </Button>
                      </form>
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
