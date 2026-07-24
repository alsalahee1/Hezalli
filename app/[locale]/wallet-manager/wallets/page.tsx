import { Snowflake } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { prisma } from "@/lib/prisma";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function WalletManagerWalletsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; frozen?: string; page?: string }>;
}) {
  const t = await getTranslations("WalletManager");
  const format = await getFormatter();
  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

  const { q, frozen, page } = await searchParams;
  const query = q?.trim() || "";
  const pageNum = Math.max(1, Number(page) || 1);

  const wallets = await prisma.wallet.findMany({
    where: {
      ...(frozen === "1" ? { frozen: true } : {}),
      ...(query
        ? {
            user: {
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                { email: { contains: query, mode: "insensitive" } },
              ],
            },
          }
        : {}),
    },
    orderBy: { availableUsd: "desc" },
    take: PAGE_SIZE + 1, // one extra row = "there is a next page"
    skip: (pageNum - 1) * PAGE_SIZE,
    select: {
      id: true,
      availableUsd: true,
      frozen: true,
      updatedAt: true,
      user: { select: { name: true, email: true } },
    },
  });

  const hasNext = wallets.length > PAGE_SIZE;
  const rows = wallets.slice(0, PAGE_SIZE);
  const pageHref = (p: number) => {
    const sp = new URLSearchParams();
    if (query) sp.set("q", query);
    if (frozen === "1") sp.set("frozen", "1");
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return `/wallet-manager/wallets${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("wallets")}
        </h1>
        <p className="text-muted-foreground text-sm">{t("walletsDesc")}</p>
      </div>

      <form className="flex max-w-md gap-2">
        <Input
          type="search"
          name="q"
          defaultValue={query}
          placeholder={t("searchPlaceholder")}
          className="flex-1"
        />
        <Button type="submit">{t("search")}</Button>
      </form>

      {rows.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed py-10 text-center text-sm">
          {t("walletsEmpty")}
        </div>
      ) : (
        <ul className="divide-y rounded-lg border">
          {rows.map((w) => (
            <li key={w.id}>
              <Link
                href={`/wallet-manager/wallets/${w.id}`}
                className="hover:bg-muted/50 flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-medium">
                    {w.user.name ?? "—"}
                    {w.frozen ? (
                      <Snowflake className="size-3.5 text-sky-500" />
                    ) : null}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {w.user.email}
                  </p>
                </div>
                <span className="font-semibold" dir="ltr">
                  {money(Number(w.availableUsd))}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {pageNum > 1 || hasNext ? (
        <div className="flex items-center justify-between text-sm">
          {pageNum > 1 ? (
            <Link
              href={pageHref(pageNum - 1)}
              className="text-primary font-medium hover:underline"
            >
              ← {t("prevPage")}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground text-xs">
            {t("pageLabel", { page: pageNum })}
          </span>
          {hasNext ? (
            <Link
              href={pageHref(pageNum + 1)}
              className="text-primary font-medium hover:underline"
            >
              {t("nextPage")} →
            </Link>
          ) : (
            <span />
          )}
        </div>
      ) : null}
    </div>
  );
}
