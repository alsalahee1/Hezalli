import { getTranslations } from "next-intl/server";
import { ChevronLeft, Store, Wallet } from "lucide-react";

import { Link } from "@/i18n/navigation";

/**
 * Native app-style top bar for the wallet on phones. On mobile the storefront
 * chrome is hidden (globals.css [data-native-wallet]) so these screens would
 * otherwise open with no header — this stands in for it. `md:hidden` leaves the
 * desktop layout (storefront header + account nav) untouched; `-mx-4 -mt-3`
 * pulls it out past the account shell's padding so it reads as a real bar.
 *
 * Overview: brand on one side, a storefront escape hatch on the other.
 * Sub-screens: pass `backHref` to swap the storefront exit for a back arrow.
 */
export async function WalletAppHeader({ backHref }: { backHref?: string }) {
  const t = await getTranslations("Wallet");
  const tNav = await getTranslations("WalletNav");

  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/85 sticky top-0 z-30 -mx-4 -mt-3 flex items-center justify-between border-b px-4 py-3 backdrop-blur md:hidden">
      <div className="flex items-center gap-1">
        {backHref ? (
          <Link
            href={backHref}
            aria-label={t("backToWallet")}
            className="text-muted-foreground hover:text-foreground hover:bg-muted -ms-2 inline-flex size-9 items-center justify-center rounded-full transition-colors"
          >
            <ChevronLeft className="size-5 rtl:rotate-180" />
          </Link>
        ) : null}
        <span className="flex items-center gap-2 font-semibold">
          <Wallet className="text-primary size-5" aria-hidden /> {t("appName")}
        </span>
      </div>
      {backHref ? null : (
        <Link
          href="/"
          aria-label={tNav("exit")}
          title={tNav("exit")}
          className="text-muted-foreground hover:text-foreground hover:bg-muted inline-flex size-9 items-center justify-center rounded-full transition-colors"
        >
          <Store className="size-5" />
        </Link>
      )}
    </header>
  );
}
