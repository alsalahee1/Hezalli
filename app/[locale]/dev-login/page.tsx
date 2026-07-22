import { notFound } from "next/navigation";
import { ShieldAlert, LogIn } from "lucide-react";

import { devSignIn } from "@/lib/actions/auth";
import { prisma } from "@/lib/prisma";

// One-click "fast login" for testing. Signs in through the normal credentials
// flow, pre-filled with a seed account and the known seed password (see
// devSignIn). Only rendered when DEV_LOGIN_ENABLED is set; otherwise it 404s.
// English-only — it's a dev tool, not a buyer-facing page.
const DEMO = [
  {
    email: "admin@hezalli.com",
    label: "Admin",
    desc: "Full admin panel — settings, dispatch, orders",
  },
  {
    email: "seller1@hezalli.com",
    label: "Seller",
    desc: "Store & products (Sana'a Electronics)",
  },
  {
    email: "wallet@hezalli.com",
    label: "Wallet Manager",
    desc: "Money desk — top-ups, withdrawals, payouts (/wallet-manager)",
  },
  {
    email: "delivery@hezalli.com",
    label: "Delivery Manager",
    desc: "Shipments oversight — status, tracking, carriers (/delivery-manager)",
  },
  {
    email: "point@hezalli.com",
    label: "Point Center",
    desc: "Hezalli Point parcel-hub dashboard (/point)",
  },
  {
    email: "driver@hezalli.com",
    label: "Courier",
    desc: "Hezalli Express driver app (/driver)",
  },
  {
    email: "buyer1@example.com",
    label: "Buyer",
    desc: "Shopper — browse, checkout, track",
  },
];

export default async function DevLoginPage() {
  if (process.env.DEV_LOGIN_ENABLED !== "true") notFound();

  const emails = DEMO.map((d) => d.email);
  const found = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { email: true, name: true },
  });
  const byEmail = new Map(found.map((u) => [u.email, u]));

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <div className="mb-5 flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-600" />
        <div>
          <p className="font-semibold text-amber-700 dark:text-amber-500">
            Test mode — seed-account quick login
          </p>
          <p className="text-muted-foreground mt-0.5">
            One click signs you in as a seed account using its known test
            password. Enabled by{" "}
            <code className="rounded bg-black/5 px-1 dark:bg-white/10">
              DEV_LOGIN_ENABLED
            </code>
            . Never turn this on in production.
          </p>
        </div>
      </div>

      <h1 className="mb-1 text-xl font-semibold">Quick login</h1>
      <p className="text-muted-foreground mb-5 text-sm">
        Choose an account to test as. You&apos;ll land on that role&apos;s home
        screen.
      </p>

      <div className="space-y-2.5">
        {DEMO.map((d) => {
          const user = byEmail.get(d.email);
          const disabled = !user;
          return (
            <form key={d.email} action={devSignIn}>
              <input type="hidden" name="email" value={d.email} />
              <button
                type="submit"
                disabled={disabled}
                className="hover:border-primary/50 flex w-full items-center justify-between gap-3 rounded-lg border p-4 text-start transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="font-medium">{user?.name ?? d.label}</span>
                    <span className="bg-primary/10 text-primary rounded px-1.5 py-0.5 text-[11px] font-semibold">
                      {d.label}
                    </span>
                  </span>
                  <span className="text-muted-foreground mt-0.5 block text-xs">
                    {disabled ? "Not in this database — run the seed" : d.desc}
                  </span>
                  <span
                    className="text-muted-foreground/70 mt-0.5 block text-xs"
                    dir="ltr"
                  >
                    {d.email}
                  </span>
                </span>
                <LogIn className="text-muted-foreground size-5 shrink-0 rtl:rotate-180" />
              </button>
            </form>
          );
        })}
      </div>

      <p className="text-muted-foreground mt-6 text-center text-xs">
        Seed password for manual login: <code>hezalli123</code>
      </p>
    </main>
  );
}
