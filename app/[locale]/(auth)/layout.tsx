import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { LanguageSwitcher } from "@/components/layout/language-switcher";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const c = await getTranslations("Common");
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4">
        <Link href="/" className="text-xl font-bold tracking-tight">
          {c("appName")}
        </Link>
        <LanguageSwitcher />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
