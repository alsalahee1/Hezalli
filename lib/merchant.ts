// HezalliPay merchant helpers. A merchant's `slug` backs its public pay URL
// (/pay/m/[slug]) — the QR a shop prints at the counter. See
// lib/actions/merchant-application.ts and docs/19-wallet-strategy.md §4.
import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

type Tx = Prisma.TransactionClient;

/** Turn a business name into a URL-safe base slug (ASCII, lowercase, hyphens). */
export function slugifyMerchant(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    // strip combining marks (accents) that NFKD split off
    .replace(/[̀-ͯ]/g, "")
    // keep ASCII letters/digits; everything else (incl. Arabic) becomes a gap
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "shop";
}

/**
 * Return a slug unique across MerchantProfile, derived from `name`. Appends a
 * short numeric suffix on collision (shop, shop-2, shop-3, …). Pass the same
 * transaction client used to create the profile so the check and the insert
 * share one snapshot; the DB unique index is the ultimate guard.
 */
export async function uniqueMerchantSlug(
  name: string,
  client: Tx | typeof prisma = prisma,
): Promise<string> {
  const base = slugifyMerchant(name);
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const clash = await client.merchantProfile.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!clash) return candidate;
  }
  // Extremely unlikely fallback (50 taken variants): base + a random tail.
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}
