import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import { resolveCartLines } from "@/lib/cart";
import { listRoutablePoints } from "@/lib/point-select";
import { prisma } from "@/lib/prisma";
import {
  quoteShippingForStores,
  resolveZoneId,
  type StoreShipOptions,
} from "@/lib/shipping";
import { getSetting } from "@/lib/settings";
import {
  CheckoutFlow,
  type CheckoutAddress,
} from "@/components/checkout/checkout-flow";

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ items?: string }>;
}) {
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user?.id) {
    redirect(`/${locale}/login?callbackUrl=/${locale}/checkout`);
  }
  const t = await getTranslations("Checkout");
  const sp = await searchParams;
  const selected = (sp.items ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const [cart, buyer] = await Promise.all([
    prisma.cart.findUnique({
      where: { userId: session.user.id },
      select: {
        items: {
          where: { savedForLater: false },
          select: { variantId: true, storeId: true, quantity: true },
        },
      },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        loyaltyPoints: true,
        wallet: { select: { availableUsd: true } },
      },
    }),
  ]);
  let stubs = cart?.items ?? [];
  if (selected.length > 0) {
    stubs = stubs.filter((i) => selected.includes(i.variantId));
  }
  const lines = await resolveCartLines(stubs, locale);
  if (lines.length === 0) {
    redirect(`/${locale}/cart`);
  }

  const addrRows = await prisma.address.findMany({
    where: { userId: session.user.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  const addresses: CheckoutAddress[] = addrRows.map((a) => ({
    id: a.id,
    fullName: a.fullName,
    phone: a.phone,
    governorate: a.governorate,
    city: a.city,
    line1: a.line1,
    line2: a.line2,
  }));

  // Per-store subtotals, then a shipping quote for every saved address so the
  // fee updates instantly when the buyer switches address (no round-trip).
  const subtotals = new Map<string, number>();
  for (const l of lines) {
    subtotals.set(
      l.storeId,
      (subtotals.get(l.storeId) ?? 0) + l.price * l.quantity,
    );
  }
  const shipGroups = [...subtotals.entries()].map(([storeId, subtotal]) => ({
    storeId,
    subtotal,
  }));
  const shippingByAddress: Record<
    string,
    Record<string, StoreShipOptions>
  > = {};
  for (const a of addrRows) {
    const quote = await quoteShippingForStores(a.governorate, shipGroups);
    shippingByAddress[a.id] = Object.fromEntries(quote);
  }

  const codEnabled = await getSetting("cod_enabled");
  const scheduleDays = await getSetting("delivery_window_days");

  // Serviceability: with coverage required, flag addresses in governorates no
  // ShippingZone serves so the client can warn and steer to pickup (placeOrder
  // re-checks authoritatively).
  const uncoveredAddressIds: string[] = [];
  if (await getSetting("require_zone_coverage")) {
    const govs = [...new Set(addrRows.map((a) => a.governorate))];
    const zones = await Promise.all(govs.map((g) => resolveZoneId(g)));
    const uncoveredGovs = new Set(govs.filter((_, i) => !zones[i]));
    for (const a of addrRows) {
      if (uncoveredGovs.has(a.governorate)) uncoveredAddressIds.push(a.id);
    }
  }

  // Points that can still take parcels (full ones are filtered out); the
  // client re-sorts nearest-first for whichever address is selected.
  const pointRows = await listRoutablePoints();
  const pickupPoints = pointRows.map((p) => ({
    id: p.id,
    label: `${p.name} — ${p.city}, ${p.governorate}`,
    governorate: p.governorate,
  }));

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="mb-5 text-2xl font-semibold tracking-tight">
        {t("title")}
      </h1>
      <CheckoutFlow
        lines={lines}
        addresses={addresses}
        shippingByAddress={shippingByAddress}
        codEnabled={codEnabled}
        points={buyer?.loyaltyPoints ?? 0}
        walletBalance={Number(buyer?.wallet?.availableUsd ?? 0)}
        pickupPoints={pickupPoints}
        scheduleDays={scheduleDays}
        uncoveredAddressIds={uncoveredAddressIds}
      />
    </main>
  );
}
