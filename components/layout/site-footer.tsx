"use client";

import { ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

export function SiteFooter() {
  const t = useTranslations("Footer");
  const c = useTranslations("Common");
  const year = new Date().getFullYear();

  const links = [
    { href: "/about", key: "about" },
    { href: "/sell", key: "sellOnHezalli" },
    { href: "/terms", key: "terms" },
    { href: "/privacy", key: "privacy" },
  ] as const;

  return (
    <footer className="bg-muted/30 mt-16 border-t">
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm space-y-2">
            <p className="text-lg font-bold">{c("appName")}</p>
            <p className="text-muted-foreground text-sm">{c("tagline")}</p>
            <p className="text-muted-foreground flex items-start gap-2 pt-2 text-sm">
              <ShieldCheck className="text-foreground mt-0.5 size-4 shrink-0" />
              {t("protection")}
            </p>
          </div>

          <nav>
            <p className="mb-3 text-sm font-semibold">{t("company")}</p>
            <ul className="text-muted-foreground space-y-2 text-sm">
              {links.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="hover:text-foreground hover:underline"
                  >
                    {t(l.key)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <p className="text-muted-foreground mt-8 border-t pt-6 text-xs">
          {t("rights", { year })}
        </p>
      </div>
    </footer>
  );
}
