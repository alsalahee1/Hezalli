"use client";

import { useState } from "react";
import {
  ArrowLeftRight,
  HandCoins,
  BookOpen,
  BadgeCheck,
  Banknote,
  BarChart3,
  Bike,
  History,
  Images,
  LayoutDashboard,
  Mail,
  MapPin,
  MapPinned,
  Menu,
  MessageSquare,
  Package,
  Route,
  ScanLine,
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
import { AssistantIcon } from "@/components/ai/assistant-icon";
import { useMountTransition } from "@/components/ui/use-mount-transition";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { ChatIcon } from "@/components/chat/chat-icon";
import { CenterTabBar } from "@/components/layout/center-tab-bar";

type NavItem = {
  href: string;
  key: string;
  icon: React.ComponentType<{ className?: string }>;
};

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
  { href: "/seller/how", key: "how", icon: BookOpen },
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
  { href: "/admin/cash", key: "cash", icon: HandCoins },
  { href: "/wallet-manager", key: "walletManager", icon: Wallet },
  { href: "/admin/shipping-zones", key: "shippingZones", icon: MapPin },
  { href: "/admin/carriers", key: "carriers", icon: Truck },
  { href: "/delivery-manager", key: "deliveryManager", icon: Truck },
  { href: "/admin/delivery-team", key: "deliveryTeam", icon: Users },
  { href: "/admin/dispatch", key: "dispatch", icon: Route },
  { href: "/admin/couriers", key: "couriers", icon: Bike },
  { href: "/admin/fleets", key: "fleets", icon: Truck },
  { href: "/admin/points", key: "points", icon: MapPinned },
  { href: "/admin/disputes", key: "disputes", icon: ShieldAlert },
  { href: "/admin/categories", key: "categories", icon: Shapes },
  { href: "/admin/brands", key: "brands", icon: Tags },
  { href: "/admin/promotions", key: "promotions", icon: Tag },
  { href: "/admin/flash-sales", key: "flashSales", icon: Zap },
  { href: "/admin/newsletter", key: "newsletter", icon: Mail },
  { href: "/admin/pages", key: "pages", icon: ScrollText },
  { href: "/admin/banners", key: "banners", icon: Images },
  { href: "/admin/audit", key: "audit", icon: History },
  { href: "/admin/assistant", key: "assistant", icon: AssistantIcon },
  { href: "/admin/settings", key: "settings", icon: Settings },
  { href: "/admin/how", key: "how", icon: BookOpen },
];

const WALLET_MANAGER_NAV: NavItem[] = [
  { href: "/wallet-manager", key: "dashboard", icon: LayoutDashboard },
  { href: "/wallet-manager/payments", key: "paymentsDesk", icon: Banknote },
  {
    href: "/wallet-manager/withdrawals",
    key: "withdrawals",
    icon: ArrowLeftRight,
  },
  { href: "/wallet-manager/payouts", key: "payouts", icon: Store },
  { href: "/wallet-manager/wallets", key: "wallets", icon: Wallet },
  { href: "/wallet-manager/kyc", key: "kyc", icon: BadgeCheck },
  { href: "/wallet-manager/audit", key: "audit", icon: ScaleIcon },
  { href: "/wallet-manager/transfers", key: "transfers", icon: Users },
  { href: "/wallet-manager/history", key: "history", icon: History },
  { href: "/wallet-manager/how", key: "how", icon: BookOpen },
];
const WALLET_MANAGER_PRIMARY = [
  "/wallet-manager",
  "/wallet-manager/payments",
  "/wallet-manager/withdrawals",
  "/wallet-manager/wallets",
];

const DELIVERY_MANAGER_NAV: NavItem[] = [
  { href: "/delivery-manager", key: "dashboard", icon: LayoutDashboard },
  { href: "/delivery-manager/dispatch", key: "dispatch", icon: Route },
  { href: "/delivery-manager/scan", key: "scan", icon: ScanLine },
  { href: "/delivery-manager/shipments", key: "shipments", icon: Package },
  { href: "/delivery-manager/couriers", key: "couriers", icon: Bike },
  { href: "/delivery-manager/points", key: "points", icon: MapPinned },
  { href: "/delivery-manager/cash", key: "cash", icon: HandCoins },
  { href: "/delivery-manager/remittances", key: "remittances", icon: Banknote },
  { href: "/delivery-manager/fleets", key: "fleets", icon: Users },
  { href: "/delivery-manager/carriers", key: "carriers", icon: Truck },
  {
    href: "/delivery-manager/shipping-zones",
    key: "shippingZones",
    icon: MapPin,
  },
  {
    href: "/delivery-manager/categories",
    key: "deliveryDefaults",
    icon: Shapes,
  },
  {
    href: "/delivery-manager/vehicles",
    key: "vehicleCapacity",
    icon: Truck,
  },
  { href: "/delivery-manager/how", key: "how", icon: BookOpen },
];
const DELIVERY_MANAGER_PRIMARY = [
  "/delivery-manager",
  "/delivery-manager/dispatch",
  "/delivery-manager/shipments",
  "/delivery-manager/couriers",
];

type Variant = "seller" | "admin" | "walletManager" | "deliveryManager";

const VARIANTS: Record<
  Variant,
  {
    nav: NavItem[];
    primary: string[];
    ns: string;
    titleKey: string;
    base: string;
  }
> = {
  seller: {
    nav: SELLER_NAV,
    primary: SELLER_PRIMARY,
    ns: "Seller",
    titleKey: "center",
    base: "/seller",
  },
  admin: {
    nav: ADMIN_NAV,
    primary: ADMIN_PRIMARY,
    ns: "Admin",
    titleKey: "panel",
    base: "/admin",
  },
  walletManager: {
    nav: WALLET_MANAGER_NAV,
    primary: WALLET_MANAGER_PRIMARY,
    ns: "WalletManager",
    titleKey: "panel",
    base: "/wallet-manager",
  },
  deliveryManager: {
    nav: DELIVERY_MANAGER_NAV,
    primary: DELIVERY_MANAGER_PRIMARY,
    ns: "DeliveryManager",
    titleKey: "panel",
    base: "/delivery-manager",
  },
};

export function DashboardShell({
  variant,
  children,
  navKeys,
}: {
  variant: Variant;
  children: React.ReactNode;
  // When set, restricts the sidebar to items whose key is listed — used by the
  // delivery-ops team so a scoped member sees only their desks. Omit to show
  // the variant's full nav (all other dashboards).
  navKeys?: string[];
}) {
  const { nav: fullNav, primary, ns, titleKey, base } = VARIANTS[variant];
  const nav = navKeys
    ? fullNav.filter((item) => navKeys.includes(item.key))
    : fullNav;
  const t = useTranslations(ns);
  const c = useTranslations("Common");
  const q = useTranslations("QuickNav");
  const a11y = useTranslations("A11y");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { mounted, shown } = useMountTransition(open);

  // Build the phone bottom bar from the same nav list: four primary tabs plus
  // everything (in sidebar order) behind "More".
  const toTab = (item: NavItem) => ({
    href: item.href,
    label: t(item.key),
    icon: item.icon,
    exact: item.href === base,
  });
  const primaryTabs = primary
    .map((href) => nav.find((n) => n.href === href))
    .filter((n): n is NavItem => Boolean(n))
    .map(toTab);
  const moreTabs = nav.map(toTab);

  const isActive = (href: string) =>
    href === base ? pathname === href : pathname.startsWith(href);

  // `rail` renders the tablet-width (md, 768–1023px) icon-only sidebar; the
  // same nav switches to full icon+label at `lg` (desktop) and inside the
  // phone drawer (which is only ever shown below `md`, so the lg: overrides
  // below have no effect there — it always renders full).
  const sidebar = (rail: boolean) => (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          "flex h-14 items-center gap-2 border-b px-4",
          rail && "justify-center px-2 lg:justify-start lg:px-4",
        )}
      >
        <Store className="size-5 shrink-0" />
        <span className={cn("font-semibold", rail && "hidden lg:inline")}>
          {t(titleKey)}
        </span>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {nav.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              title={rail ? t(item.key) : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                rail && "justify-center px-2 lg:justify-start lg:px-3",
                isActive(item.href)
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-5 shrink-0" />
              <span className={cn(rail && "hidden lg:inline")}>
                {t(item.key)}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* Tablet gets a compact icon-only rail (md); desktop gets the full
          labeled sidebar (lg). */}
      <aside className="bg-background hidden w-16 shrink-0 border-e md:block lg:w-64">
        {sidebar(true)}
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
            {sidebar(false)}
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
            <NotificationBell
              variant={variant === "seller" ? "seller" : "admin"}
            />
            {/* Quick hops out of the dashboard: the user's HezalliPay wallet
                and the storefront — reachable from every panel screen. */}
            <Link
              href="/account/wallet"
              aria-label={q("wallet")}
              title={q("wallet")}
              className="text-muted-foreground hover:text-foreground hover:bg-muted inline-flex size-9 items-center justify-center rounded-full transition-colors"
            >
              <Wallet className="size-5" />
            </Link>
            <Link
              href="/"
              aria-label={q("store")}
              title={q("store")}
              className="text-muted-foreground hover:text-foreground hover:bg-muted inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-medium transition-colors"
            >
              <Store className="size-5" />
              <span className="hidden sm:inline">{q("store")}</span>
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
