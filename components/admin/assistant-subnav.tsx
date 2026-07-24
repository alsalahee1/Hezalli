"use client";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { Link, usePathname } from "@/i18n/navigation";

// One admin sidebar entry, three views. This tab bar sits at the top of every
// /admin/assistant page (via the shared layout) so settings, stats and the
// knowledge base read as tabs of a single screen instead of separate menu
// items. usePathname() here is locale-stripped, so we match bare paths.
const TABS = [
  { href: "/admin/assistant", key: "navSettings" },
  { href: "/admin/assistant/stats", key: "navStats" },
  { href: "/admin/assistant/faq", key: "navFaq" },
] as const;

export function AssistantSubnav() {
  const t = useTranslations("AdminAssistant");
  const pathname = usePathname();

  return (
    <div role="tablist" className="flex gap-1 border-b">
      {TABS.map((tab) => {
        // Settings is the base path, so only an exact match counts for it;
        // the others match their own segment.
        const active =
          tab.href === "/admin/assistant"
            ? pathname === "/admin/assistant"
            : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            role="tab"
            aria-selected={active}
            className={cn(
              "-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              active
                ? "border-primary text-primary"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {t(tab.key)}
          </Link>
        );
      })}
    </div>
  );
}
