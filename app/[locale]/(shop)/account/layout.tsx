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
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">
        {t("title")}
      </h1>
      <div className="grid gap-8 md:grid-cols-[200px_1fr]">
        <aside className="min-w-0">
          <AccountNav />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
      <AccountTabBar />
    </div>
  );
}
