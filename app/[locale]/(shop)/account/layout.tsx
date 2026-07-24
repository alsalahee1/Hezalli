import { getLocale, getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import { redirect } from "@/i18n/navigation";
import { AccountNav } from "@/components/account/account-nav";
import { AccountTabBar } from "@/components/account/account-tab-bar";

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user) redirect({ href: "/login", locale });

  const t = await getTranslations("Account");

  return (
    <div data-account-shell className="mx-auto max-w-5xl px-4 py-8">
      <h1
        data-account-heading
        className="mb-6 text-2xl font-semibold tracking-tight"
      >
        {t("title")}
      </h1>
      <div className="md:grid md:grid-cols-[64px_1fr] md:gap-4 lg:grid-cols-[200px_1fr] lg:gap-8">
        <aside data-account-nav className="hidden min-w-0 md:block">
          <AccountNav />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
      {/* Reserve room so the fixed bottom tab bar never covers content on
          phones; collapses at `md` where the bar hides. */}
      <div
        className="h-16 md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-hidden
      />
      <AccountTabBar />
    </div>
  );
}
