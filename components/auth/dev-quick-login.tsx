import { prisma } from "@/lib/prisma";
import { DevQuickLoginCards } from "@/components/auth/dev-quick-login-cards";

// One-tap "fast login" cards on the login screen — a card per seed account.
// Renders nothing unless DEV_LOGIN_ENABLED === "true" (server-only env), so it
// never appears in production. Clicking a card fills the login form's email
// field with the seed account's address; the tester types the shared demo
// password ("salahahmed") themselves — so it's not an auth bypass, just a
// convenience over the normal credentials flow.
const DEMO_EMAILS = [
  "admin@hezalli.com",
  "seller1@hezalli.com",
  "buyer1@example.com",
  "driver@hezalli.com",
  "point@hezalli.com",
  "wallet@hezalli.com",
  "delivery@hezalli.com",
];

export async function DevQuickLogin() {
  if (process.env.DEV_LOGIN_ENABLED !== "true") return null;

  const found = await prisma.user.findMany({
    where: { email: { in: DEMO_EMAILS } },
    select: { email: true },
  });
  const have = found
    .map((u) => u.email)
    .filter((email): email is string => email !== null);
  if (have.length === 0) return null;

  return <DevQuickLoginCards have={have} />;
}
