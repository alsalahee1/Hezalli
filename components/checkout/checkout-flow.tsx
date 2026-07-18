"use client";

import { useMemo, useState } from "react";
import { MapPin, Plus, Store as StoreIcon, Truck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { placeOrder, type PaymentMethodChoice } from "@/lib/actions/order";
import type { CartLine } from "@/lib/cart-types";
import { formatUsd } from "@/lib/products";
import { standardShipping } from "@/lib/shipping";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type CheckoutAddress = {
  id: string;
  fullName: string;
  phone: string;
  governorate: string;
  city: string;
  line1: string;
  line2: string | null;
};

export function CheckoutFlow({
  lines,
  addresses,
}: {
  lines: CartLine[];
  addresses: CheckoutAddress[];
}) {
  const t = useTranslations("Checkout");
  const locale = useLocale();
  const [addressId, setAddressId] = useState(addresses[0]?.id ?? "");
  const [method, setMethod] = useState<PaymentMethodChoice>("COD");
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const METHODS: { key: PaymentMethodChoice; label: string; hint: string }[] = [
    { key: "COD", label: t("cod"), hint: t("codHint") },
    { key: "BANK_TRANSFER", label: t("bank"), hint: t("bankHint") },
    { key: "USDT", label: t("usdt"), hint: t("usdtHint") },
    { key: "WALLET", label: t("wallet"), hint: t("walletHint") },
  ];

  const groups = useMemo(() => {
    const map = new Map<string, { storeName: string; lines: CartLine[] }>();
    for (const l of lines) {
      const g = map.get(l.storeId) ?? { storeName: l.storeName, lines: [] };
      g.lines.push(l);
      map.set(l.storeId, g);
    }
    return [...map.values()].map((g) => {
      const itemsTotal = g.lines.reduce((s, l) => s + l.price * l.quantity, 0);
      return { ...g, itemsTotal, shipping: standardShipping(itemsTotal) };
    });
  }, [lines]);

  const itemsTotal = groups.reduce((s, g) => s + g.itemsTotal, 0);
  const shippingTotal = groups.reduce((s, g) => s + g.shipping, 0);
  const grandTotal = itemsTotal + shippingTotal;

  const submit = async () => {
    setError(null);
    if (!addressId) {
      setError("addressRequired");
      return;
    }
    setPlacing(true);
    const res = await placeOrder({
      addressId,
      items: lines.map((l) => ({
        variantId: l.variantId,
        quantity: l.quantity,
      })),
      paymentMethod: method,
    });
    if (res.error) {
      setError(res.error);
      setPlacing(false);
      return;
    }
    // Full navigation so the cart provider re-reads the now-empty server cart.
    // Prepaid orders go to the order page to submit payment proof.
    const dest =
      method === "COD"
        ? `/${locale}/checkout/success?order=${res.orderId}`
        : `/${locale}/account/orders/${res.orderId}`;
    window.location.assign(dest);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        {/* Step 1 — Address */}
        <section className="rounded-lg border p-4">
          <h2 className="mb-3 flex items-center gap-2 font-semibold">
            <MapPin className="size-4" /> {t("addressTitle")}
          </h2>
          {addresses.length === 0 ? (
            <div className="text-sm">
              <p className="text-muted-foreground mb-2">{t("noAddress")}</p>
              <Button asChild size="sm" variant="outline">
                <Link href="/account/addresses">
                  <Plus className="size-4" /> {t("addAddress")}
                </Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {addresses.map((a) => (
                <label
                  key={a.id}
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-md border p-3 text-sm",
                    addressId === a.id
                      ? "border-primary bg-primary/5"
                      : "hover:border-muted-foreground/40",
                  )}
                >
                  <input
                    type="radio"
                    name="address"
                    className="mt-1 size-4"
                    checked={addressId === a.id}
                    onChange={() => setAddressId(a.id)}
                  />
                  <span>
                    <span className="font-medium">{a.fullName}</span>
                    <span className="text-muted-foreground"> · {a.phone}</span>
                    <br />
                    <span className="text-muted-foreground">
                      {a.line1}
                      {a.line2 ? `, ${a.line2}` : ""}, {a.city}, {a.governorate}
                    </span>
                  </span>
                </label>
              ))}
              <Button asChild size="sm" variant="ghost">
                <Link href="/account/addresses">
                  <Plus className="size-4" /> {t("addAddress")}
                </Link>
              </Button>
            </div>
          )}
        </section>

        {/* Step 2 — Shipping (per seller) */}
        <section className="rounded-lg border p-4">
          <h2 className="mb-3 flex items-center gap-2 font-semibold">
            <Truck className="size-4" /> {t("shippingTitle")}
          </h2>
          <div className="space-y-3">
            {groups.map((g, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-sm"
              >
                <span className="flex items-center gap-1.5">
                  <StoreIcon className="text-muted-foreground size-3.5" />
                  {g.storeName}
                </span>
                <span>
                  {t("standardShipping")} —{" "}
                  {g.shipping === 0 ? (
                    <span className="font-medium text-emerald-600">
                      {t("free")}
                    </span>
                  ) : (
                    <span dir="ltr">{formatUsd(g.shipping, locale)}</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Step 3 — Payment */}
        <section className="rounded-lg border p-4">
          <h2 className="mb-3 font-semibold">{t("paymentTitle")}</h2>
          <div className="space-y-2">
            {METHODS.map((m) => (
              <label
                key={m.key}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm",
                  method === m.key
                    ? "border-primary bg-primary/5"
                    : "hover:border-muted-foreground/40",
                )}
              >
                <input
                  type="radio"
                  name="method"
                  className="size-4"
                  checked={method === m.key}
                  onChange={() => setMethod(m.key)}
                />
                <span className="font-medium">{m.label}</span>
                <span className="text-muted-foreground">{m.hint}</span>
              </label>
            ))}
          </div>
          {method !== "COD" ? (
            <p className="text-muted-foreground mt-2 text-xs">
              {t("prepaidNote")}
            </p>
          ) : null}
          <div className="mt-3 flex gap-2">
            <input
              disabled
              placeholder={t("couponPlaceholder")}
              className="bg-muted/40 h-9 flex-1 rounded-md border px-3 text-sm"
            />
            <Button size="sm" variant="outline" disabled>
              {t("apply")}
            </Button>
          </div>
        </section>
      </div>

      {/* Summary */}
      <aside className="h-fit rounded-lg border p-4 lg:sticky lg:top-24">
        <h2 className="mb-3 font-semibold">{t("summary")}</h2>
        <div className="max-h-48 space-y-2 overflow-auto">
          {lines.map((l) => (
            <div
              key={l.variantId}
              className="flex justify-between gap-2 text-sm"
            >
              <span className="text-muted-foreground line-clamp-1">
                {l.quantity} × {l.title}
              </span>
              <span dir="ltr">{formatUsd(l.price * l.quantity, locale)}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 space-y-1 border-t pt-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("itemsTotal")}</span>
            <span dir="ltr">{formatUsd(itemsTotal, locale)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("shippingTotal")}</span>
            <span dir="ltr">{formatUsd(shippingTotal, locale)}</span>
          </div>
          <div className="flex justify-between border-t pt-1 text-base font-semibold">
            <span>{t("grandTotal")}</span>
            <span dir="ltr">{formatUsd(grandTotal, locale)}</span>
          </div>
        </div>
        {error ? (
          <p className="text-destructive mt-3 text-sm">{t(`err_${error}`)}</p>
        ) : null}
        <Button
          className="mt-4 w-full"
          disabled={placing || addresses.length === 0 || lines.length === 0}
          onClick={submit}
        >
          {placing ? t("placing") : t("placeOrder")}
        </Button>
      </aside>
    </div>
  );
}
