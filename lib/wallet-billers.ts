// Bill payment & airtime top-up catalog (Step 19.7). A static, provider-ready
// list of billers (utilities/services) and airtime operators. This is the seam
// where a real biller/telco aggregator plugs in later: swap this list for the
// provider's product catalog and add a fulfillment call in lib/actions/wallet-bills.ts.
// Names are bilingual; slugs are stable ids stored on WalletBillPayment.biller.
import type { WalletBillKind } from "@/lib/generated/prisma/client";

export type Biller = {
  slug: string;
  kind: WalletBillKind;
  name: { en: string; ar: string };
};

// Yemeni utilities / services (bills) and mobile operators (airtime). Extend
// freely — the UI renders whatever is listed here for the selected kind.
export const BILLERS: Biller[] = [
  // Utilities & services — kind BILL. `account` is the customer/subscriber no.
  {
    slug: "public-electricity",
    kind: "BILL",
    name: { en: "Public Electricity", ar: "الكهرباء العامة" },
  },
  {
    slug: "local-water",
    kind: "BILL",
    name: { en: "Water & Sanitation", ar: "المياه والصرف الصحي" },
  },
  {
    slug: "yemen-net",
    kind: "BILL",
    name: { en: "YemenNet Internet", ar: "إنترنت يمن نت" },
  },
  {
    slug: "adsl-landline",
    kind: "BILL",
    name: { en: "Landline & ADSL", ar: "الهاتف الثابت وADSL" },
  },
  // Mobile operators — kind AIRTIME. `account` is the phone number.
  {
    slug: "yemen-mobile",
    kind: "AIRTIME",
    name: { en: "Yemen Mobile", ar: "يمن موبايل" },
  },
  { slug: "sabafon", kind: "AIRTIME", name: { en: "Sabafon", ar: "سبأفون" } },
  { slug: "you-yemen", kind: "AIRTIME", name: { en: "YOU", ar: "يو" } },
  {
    slug: "mtn-yemen",
    kind: "AIRTIME",
    name: { en: "MTN Yemen", ar: "إم تي إن اليمن" },
  },
];

const BY_SLUG = new Map(BILLERS.map((b) => [b.slug, b]));

/** Look up a biller/operator by slug. */
export function getBiller(slug: string): Biller | undefined {
  return BY_SLUG.get(slug);
}

/** Billers of a given kind, in catalog order. */
export function billersOfKind(kind: WalletBillKind): Biller[] {
  return BILLERS.filter((b) => b.kind === kind);
}

/** Localized display name for a biller slug (falls back to the slug). */
export function billerName(slug: string, locale: string): string {
  const b = BY_SLUG.get(slug);
  if (!b) return slug;
  return locale === "ar" ? b.name.ar : b.name.en;
}
