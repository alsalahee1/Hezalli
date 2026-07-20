"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  Banknote,
  BarChart3,
  Bike,
  History,
  Images,
  LayoutDashboard,
  Mail,
  MapPin,
  Menu,
  MessageSquare,
  Package,
  Route,
  Scale as ScaleIcon,
  ScrollText,
  Settings,
  Shapes,
  ShieldAlert,
  ShoppingBag,
  Star,
  Store,
  Tag,
  Tags,
  Truck,
  Users,
  Wallet,
  Wrench,
  Zap,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { useMountTransition } from "@/components/ui/use-mount-transition";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { ChatIcon } from "@/components/chat/chat-icon";
import { CenterTabBar } from "@/components/layout/center-tab-bar";

type NavItem = { href: string; key: string; icon: LucideIcon };

// The four destinations that get their own tab on the phone bottom bar; the
// rest of the sidebar stays reachable through the bar's "More" sheet.
const SELLER_PRIMARY = [
  "/seller",
  "/seller/products",
  "/seller/orders",
  "/seller/finance",
];
const ADMIN_PRIMARY = [
  "/admin",
  "/admin/orders",
  "/admin/users",
  "/admin/payments",
];

const SELLER_NAV: NavItem[] = [
  { href: "/seller", key: "dashboard", icon: LayoutDashboard },
  { href: "/seller/analytics", key: "analytics", icon: BarChart3 },
  { href: "/seller/products", key: "products", icon: Package },
  { href: "/seller/orders", key: "orders", icon: ShoppingBag },
  { href: "/seller/finance", key: "finance", icon: Wallet },
  { href: "/seller/returns", key: "returns", icon: ArrowLeftRight },
  { href: "/seller/chat", key: "chat", icon: MessageSquare },
  { href: "/seller/promotions", key: "promotions", icon: Tag },
  { href: "/seller/tools", key: "tools", icon: Wrench },
  { href: "/seller/settings", key: "settings", icon: Settings },
];

const ADMIN_NAV: NavItem[] = [
  { href: "/admin", key: "dashboard", icon: LayoutDashboard },
  { href: "/admin/reports", key: "reports", icon: BarChart3 },
  { href: "/admin/users", key: "users", icon: Users },
  { href: "/admin/sellers", key: "sellers", icon: Store },
  { href: "/admin/products", key: "products", icon: Package },
  { href: "/admin/orders", key: "orders", icon: ShoppingBag },
  { href: "/admin/reviews", key: "reviews", icon: Star },
  { href: "/admin/payments", key: "payments", icon: Wallet },
  { href: "/admin/wallet-audit", key: "walletAudit", icon: ScaleIcon },
  { href: "/admin/payouts", key: "payouts", icon: Banknote },
  { href: "/admin/shipping-zones", key: "shippingZones", icon: MapPin },
  { href: "/admin/carriers", key: "carriers", icon: Truck },
  { href: "/admin/dispatch", key: "dispatch", icon: Route },
  { href: "/admin/couriers", key: "couriers", icon: Bike },
  { href: "/admin/disputes", key: "disputes", icon: ShieldAlert },
  { href: "/admin/categories", key: "categories", icon: Shapes },
  { href: "/admin/brands", key: "brands", icon: Tags },
  { href: "/admin/promotions", key: "promotions", icon: Tag },
  { href: "/admin/flash-sales", key: "flashSales", icon: Zap },
  { href: "/admin/newsletter", key: "newsletter", icon: Mail },
  { href: "/admin/pages", key: "pages", icon: ScrollText },
  { href: "/admin/banners", key: "banners", icon: Images },
  { href: "/admin/audit", key: "audit", icon: History },
  { href: "/admin/settings", key: "settings", icon: Settings },
];

export function DashboardShell({
  variant,
  children,
}: {
  variant: "seller" | "admin";
  children: React.ReactNode;
}) {
  const nav = variant === "seller" ? SELLER_NAV : ADMIN_NAV;
  const ns = variant === "seller" ? "Seller" : "Admin";
  const titleKey = variant === "seller" ? "center" : "panel";
  const t = useTranslations(ns);
  const c = useTranslations("Common");
  const a11y = useTranslations("A11y");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { mounted, shown } = useMountTransition(open);

  // Build the phone bottom bar from the same nav list: four primary tabs plus
  // everything (in sidebar order) behind "More".
  const primaryHrefs = variant === "seller" ? SELLER_PRIMARY : ADMIN_PRIMARY;
  const toTab = (item: NavItem) => ({
    href: item.href,
    label: t(item.key),
    icon: item.icon,
    exact: item.href === `/${variant}`,
  });
  const primaryTabs = primaryHrefs
    .map((href) => nav.find((n) => n.href === href))
    .filter((n): n is NavItem => Boolean(n))
    .map(toTab);
  const moreTabs = nav.map(toTab);

  const isActive = (href: string) =>
    href === `/${variant}` ? pathname === href : pathname.startsWith(href);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <Store className="size-5" />
        <span className="font-semibold">{t(titleKey)}</span>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {nav.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive(item.href)
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {t(item.key)}
            </Link>
          );
        })}
      </nav>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="bg-background hidden w-64 shrink-0 border-e md:block">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {mounted && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className={cn(
              "absolute inset-0 bg-black/50 transition-opacity duration-300 ease-out motion-reduce:transition-none",
              shown ? "opacity-100" : "opacity-0",
            )}
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside
            className={cn(
              "bg-background absolute inset-y-0 start-0 w-64 transform-gpu border-e shadow-lg transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform motion-reduce:transition-none",
              shown
                ? "translate-x-0"
                : "-translate-x-full rtl:translate-x-full",
            )}
          >
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 items-center gap-3 border-b px-4">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="hover:bg-muted inline-flex size-9 items-center justify-center rounded-md md:hidden"
            aria-label={a11y("openMenu")}
          >
            <Menu className="size-5" />
          </button>
          <span className="font-semibold md:hidden">{t(titleKey)}</span>
          <div className="ms-auto flex items-center gap-1">
            {variant === "seller" ? <ChatIcon variant="seller" /> : null}
            <NotificationBell variant={variant} />
            <Link
              href="/"
              className="text-muted-foreground hover:text-foreground text-sm hover:underline"
            >
              Hezalli
            </Link>
          </div>
        </div>
        <main className="flex-1 p-6">{children}</main>
        {/* Clear the fixed bottom bar on phones; collapses at md. */}
        <div
          className="h-16 md:hidden"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          aria-hidden
        />
      </div>

      <CenterTabBar
        primary={primaryTabs}
        moreItems={moreTabs}
        moreLabel={c("more")}
        ariaLabel={t(titleKey)}
      />
    </div>
  );
}
