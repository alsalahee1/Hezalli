"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  Banknote,
  BarChart3,
  History,
  Images,
  LayoutDashboard,
  MapPin,
  Menu,
  MessageSquare,
  Package,
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
import { NotificationBell } from "@/components/notifications/notification-bell";
import { ChatIcon } from "@/components/chat/chat-icon";

type NavItem = { href: string; key: string; icon: LucideIcon };

const SELLER_NAV: NavItem[] = [
  { href: "/seller", key: "dashboard", icon: LayoutDashboard },
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
  { href: "/admin/payouts", key: "payouts", icon: Banknote },
  { href: "/admin/shipping-zones", key: "shippingZones", icon: MapPin },
  { href: "/admin/carriers", key: "carriers", icon: Truck },
  { href: "/admin/disputes", key: "disputes", icon: ShieldAlert },
  { href: "/admin/categories", key: "categories", icon: Shapes },
  { href: "/admin/brands", key: "brands", icon: Tags },
  { href: "/admin/promotions", key: "promotions", icon: Tag },
  { href: "/admin/flash-sales", key: "flashSales", icon: Zap },
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
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

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
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside className="bg-background absolute inset-y-0 start-0 w-64 border-e shadow-lg">
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
            aria-label="Open menu"
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
      </div>
    </div>
  );
}
