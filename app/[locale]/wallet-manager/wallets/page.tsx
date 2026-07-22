import { Snowflake } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { prisma } from "@/lib/prisma";
import { Link } from "@/i18n/navigation";

export const dynamic = "force-dynamic";

export default async function WalletManagerWalletsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; frozen?: string }>;
}) {
  const t = await getTranslations("WalletManager");
  const format = await getFormatter();
  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

  const { q, frozen } = await searchParams;
  const query = q?.trim() || "";

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
    take: 100,
    select: {
      id: true,
      availableUsd: true,
      frozen: true,
      updatedAt: true,
      user: { select: { name: true, email: true } },
    },
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("wallets")}
        </h1>
        <p className="text-muted-foreground text-sm">{t("walletsDesc")}</p>
      </div>

      <form className="flex max-w-md gap-2">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder={t("searchPlaceholder")}
          className="border-input bg-background h-9 flex-1 rounded-md border px-3 text-sm"
        />
        <button
          type="submit"
          className="bg-primary text-primary-foreground h-9 rounded-md px-4 text-sm font-medium"
        >
          {t("search")}
        </button>
      </form>

      {wallets.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed py-10 text-center text-sm">
          {t("walletsEmpty")}
        </div>
      ) : (
        <ul className="divide-y rounded-lg border">
          {wallets.map((w) => (
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
    </div>
  );
}
