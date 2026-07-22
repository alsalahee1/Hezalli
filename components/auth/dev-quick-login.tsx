import {
  ArrowRight,
  BadgeCheck,
  PackageSearch,
  ShieldCheck,
  ShoppingBag,
  Store,
  Truck,
  Users,
  Wallet,
} from "lucide-react";

import { devSignIn } from "@/lib/actions/auth";
import { prisma } from "@/lib/prisma";

// One-tap "fast login" cards on the login screen — a card per seed account.
// Renders nothing unless DEV_LOGIN_ENABLED === "true" (server-only env), so it
// never appears in production. Uses the same devSignIn action as /dev-login
// (normal credentials flow, seed password — not an auth bypass).
// English-only — it's a dev tool, not a buyer-facing surface.
const ADMIN = {
  email: "admin@hezalli.com",
  label: "Admin",
  desc: "Full access",
};

// One account per role beside Admin. Order matters — the 2-column grid pairs
// row 1: Seller + Buyer, row 2: Courier + Point Center, row 3: the staff
// manager desks (Wallet Manager + Delivery Manager).
const ROLES = [
  {
    email: "seller1@hezalli.com",
    label: "Seller",
    desc: "Store & products",
    icon: BadgeCheck,
    tile: "bg-blue-500",
    title: "text-blue-700 dark:text-blue-400",
    card: "border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/10",
  },
  {
    email: "buyer1@example.com",
    label: "Buyer",
    desc: "Shop & checkout",
    icon: ShoppingBag,
    tile: "bg-emerald-500",
    title: "text-emerald-700 dark:text-emerald-400",
    card: "border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10",
  },
  {
    email: "driver@hezalli.com",
    label: "Courier",
    desc: "Driver app",
    icon: Truck,
    tile: "bg-violet-500",
    title: "text-violet-700 dark:text-violet-400",
    card: "border-violet-500/30 bg-violet-500/5 hover:bg-violet-500/10",
  },
  {
    email: "point@hezalli.com",
    label: "Point Center",
    desc: "Parcel hub",
    icon: Store,
    tile: "bg-rose-500",
    title: "text-rose-700 dark:text-rose-400",
    card: "border-rose-500/30 bg-rose-500/5 hover:bg-rose-500/10",
  },
  {
    email: "wallet@hezalli.com",
    label: "Wallet Manager",
    desc: "Money desk",
    icon: Wallet,
    tile: "bg-teal-500",
    title: "text-teal-700 dark:text-teal-400",
    card: "border-teal-500/30 bg-teal-500/5 hover:bg-teal-500/10",
  },
  {
    email: "delivery@hezalli.com",
    label: "Delivery Manager",
    desc: "Shipments desk",
    icon: PackageSearch,
    tile: "bg-indigo-500",
    title: "text-indigo-700 dark:text-indigo-400",
    card: "border-indigo-500/30 bg-indigo-500/5 hover:bg-indigo-500/10",
  },
];

export async function DevQuickLogin() {
  if (process.env.DEV_LOGIN_ENABLED !== "true") return null;

  const emails = [ADMIN.email, ...ROLES.map((r) => r.email)];
  const found = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { email: true },
  });
  const have = new Set(found.map((u) => u.email));
  if (have.size === 0) return null;

  const roles = ROLES.filter((r) => have.has(r.email));

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
          <Users className="size-3.5" />
          One-tap demo access
        </p>
        <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-500">
          Demo mode
        </span>
      </div>

      {have.has(ADMIN.email) ? (
        <form action={devSignIn}>
          <input type="hidden" name="email" value={ADMIN.email} />
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-start transition-colors hover:bg-amber-500/20"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white">
              <ShieldCheck className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{ADMIN.label}</span>
              <span className="text-muted-foreground block truncate text-xs">
                {ADMIN.desc} · <span dir="ltr">{ADMIN.email}</span>
              </span>
            </span>
            <ArrowRight className="size-4 shrink-0 text-amber-600 rtl:rotate-180" />
          </button>
        </form>
      ) : null}

      {roles.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          {roles.map((r) => (
            <form key={r.email} action={devSignIn} className="h-full">
              <input type="hidden" name="email" value={r.email} />
              <button
                type="submit"
                className={`flex h-full w-full flex-col items-start gap-2 rounded-xl border p-3 text-start transition-colors ${r.card}`}
              >
                <span
                  className={`flex size-9 items-center justify-center rounded-lg text-white ${r.tile}`}
                >
                  <r.icon className="size-4.5" />
                </span>
                <span>
                  <span className={`block text-sm font-semibold ${r.title}`}>
                    {r.label}
                  </span>
                  <span className="text-muted-foreground block text-xs">
                    {r.desc}
                  </span>
                </span>
              </button>
            </form>
          ))}
        </div>
      ) : null}
    </div>
  );
}
