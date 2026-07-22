"use client";

import { ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { Logo } from "@/components/layout/logo";
import { NewsletterSignup } from "@/components/layout/newsletter-signup";

export function SiteFooter() {
  const t = useTranslations("Footer");
  const c = useTranslations("Common");
  const year = new Date().getFullYear();

  const links = [
    { href: "/how", key: "how" },
    { href: "/p/about", key: "about" },
    { href: "/sell", key: "sellOnHezalli" },
    { href: "/drive", key: "deliverWithHezalli" },
    { href: "/p/terms", key: "terms" },
    { href: "/p/privacy", key: "privacy" },
    { href: "/p/returns", key: "returns" },
    { href: "/p/faq", key: "faq" },
    { href: "/p/contact", key: "contact" },
  ] as const;

  return (
    <footer className="bg-muted/30 yemeni:bg-secondary yemeni:text-secondary-foreground yemeni:border-transparent mt-16 border-t">
      <div className="yemeni-trim yemeni:block hidden" aria-hidden />
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2 md:max-w-sm">
            <Logo wordmark={c("appName")} />
            <p className="text-muted-foreground text-sm">{c("tagline")}</p>
            <p className="text-muted-foreground flex items-start gap-2 pt-2 text-sm">
              <ShieldCheck className="text-foreground mt-0.5 size-4 shrink-0" />
              <span>{t("protection")}</span>
            </p>
          </div>

          <nav>
            <p className="mb-3 text-sm font-semibold">{t("company")}</p>
            <ul className="text-muted-foreground grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
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

          <NewsletterSignup />
        </div>

        <p className="text-muted-foreground mt-8 border-t pt-6 text-xs">
          {t("rights", { year })}
        </p>
      </div>
    </footer>
  );
}
