import { devSignIn } from "@/lib/actions/auth";
import { prisma } from "@/lib/prisma";

// One-tap "fast login" chips on the login screen — a button per seed account.
// Renders nothing unless DEV_LOGIN_ENABLED === "true" (server-only env), so it
// never appears in production. Uses the same devSignIn action as /dev-login
// (normal credentials flow, seed password — not an auth bypass).
const DEMO = [
  { email: "admin@hezalli.com", label: "Admin" },
  { email: "seller1@hezalli.com", label: "Seller" },
  { email: "seller2@hezalli.com", label: "Seller · KYC" },
  { email: "driver@hezalli.com", label: "Courier" },
  { email: "buyer1@example.com", label: "Buyer" },
];

export async function DevQuickLogin() {
  if (process.env.DEV_LOGIN_ENABLED !== "true") return null;

  const found = await prisma.user.findMany({
    where: { email: { in: DEMO.map((d) => d.email) } },
    select: { email: true },
  });
  const have = new Set(found.map((u) => u.email));
  const available = DEMO.filter((d) => have.has(d.email));
  if (available.length === 0) return null;

  return (
    <div className="rounded-lg border border-dashed border-amber-500/50 bg-amber-500/5 p-3">
      <p className="mb-2 text-center text-xs font-medium text-amber-700 dark:text-amber-500">
        Test mode · one-tap login
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {available.map((d) => (
          <form key={d.email} action={devSignIn}>
            <input type="hidden" name="email" value={d.email} />
            <button
              type="submit"
              className="hover:border-primary/60 hover:text-foreground text-muted-foreground rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
            >
              {d.label}
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}
