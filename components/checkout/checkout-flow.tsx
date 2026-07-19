"use client";

import { useMemo, useState } from "react";
import { MapPin, Plus, Store as StoreIcon, Truck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { placeOrder, type PaymentMethodChoice } from "@/lib/actions/order";
import { previewCoupon } from "@/lib/actions/coupon";
import type { CartLine } from "@/lib/cart-types";
import type { ShippingMethod, StoreShipOptions } from "@/lib/shipping";
import { capRedemption, pointsToUsd } from "@/lib/loyalty-shared";
import { formatUsd } from "@/lib/products";
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
  shippingByAddress,
  codEnabled = true,
  points = 0,
  walletBalance = 0,
}: {
  lines: CartLine[];
  addresses: CheckoutAddress[];
  shippingByAddress: Record<string, Record<string, StoreShipOptions>>;
  codEnabled?: boolean;
  points?: number;
  walletBalance?: number;
}) {
  const t = useTranslations("Checkout");
  const locale = useLocale();
  const [addressId, setAddressId] = useState(addresses[0]?.id ?? "");
  // Buyer's chosen delivery tier per store; unset stores default to STANDARD.
  const [methodByStore, setMethodByStore] = useState<
    Record<string, ShippingMethod>
  >({});
  const [method, setMethod] = useState<PaymentMethodChoice>(
    codEnabled ? "COD" : "BANK_TRANSFER",
  );
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [couponInput, setCouponInput] = useState("");
  const [appliedCode, setAppliedCode] = useState("");
  const [discount, setDiscount] = useState(0);
  const [couponErr, setCouponErr] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [usePoints, setUsePoints] = useState(false);

  const groups = useMemo(() => {
    const map = new Map<
      string,
      { storeId: string; storeName: string; lines: CartLine[] }
    >();
    for (const l of lines) {
      const g = map.get(l.storeId) ?? {
        storeId: l.storeId,
        storeName: l.storeName,
        lines: [],
      };
      g.lines.push(l);
      map.set(l.storeId, g);
    }
    const opts = shippingByAddress[addressId] ?? {};
    return [...map.values()].map((g) => {
      const itemsTotal = g.lines.reduce((s, l) => s + l.price * l.quantity, 0);
      const o = opts[g.storeId];
      const express = o?.express ?? null;
      const wanted = methodByStore[g.storeId] ?? "STANDARD";
      const selectedMethod: ShippingMethod =
        wanted === "EXPRESS" && express ? "EXPRESS" : "STANDARD";
      const option =
        selectedMethod === "EXPRESS" && express ? express : o?.standard;
      return {
        ...g,
        itemsTotal,
        standard: o?.standard ?? null,
        express,
        selectedMethod,
        shipping: option?.fee ?? 0,
      };
    });
  }, [lines, shippingByAddress, addressId, methodByStore]);

  const itemsTotal = groups.reduce((s, g) => s + g.itemsTotal, 0);
  const shippingTotal = groups.reduce((s, g) => s + g.shipping, 0);
  // Points redeem as a discount, mutually exclusive with a coupon.
  const canRedeem = points > 0 && !appliedCode;
  const redeem =
    usePoints && canRedeem
      ? capRedemption(points, points, itemsTotal)
      : { pointsUsed: 0, discountUsd: 0 };
  const grandTotal = Math.max(
    0,
    itemsTotal + shippingTotal - discount - redeem.discountUsd,
  );

  // HezalliPay is offered only when the wallet can cover the whole order; it is
  // shown disabled (with the balance) otherwise so buyers know it exists.
  const walletAffordable = walletBalance >= grandTotal && grandTotal > 0;
  const METHODS: {
    key: PaymentMethodChoice;
    label: string;
    hint: string;
    disabled?: boolean;
  }[] = [
    ...(codEnabled
      ? [{ key: "COD" as const, label: t("cod"), hint: t("codHint") }]
      : []),
    {
      key: "HEZALLI_BALANCE",
      label: t("hezalliBalance"),
      hint: t("hezalliBalanceHint", {
        balance: formatUsd(walletBalance, locale),
      }),
      disabled: !walletAffordable,
    },
    { key: "BANK_TRANSFER", label: t("bank"), hint: t("bankHint") },
    { key: "USDT", label: t("usdt"), hint: t("usdtHint") },
    { key: "LOCAL_WALLET", label: t("wallet"), hint: t("walletHint") },
  ];

  // If the selected wallet method became unaffordable (a coupon/points change
  // raised the total), fall back to the first available method for submission
  // without discarding the user's explicit choice.
  const fallbackMethod: PaymentMethodChoice = codEnabled
    ? "COD"
    : "BANK_TRANSFER";
  const effectiveMethod: PaymentMethodChoice =
    method === "HEZALLI_BALANCE" && !walletAffordable ? fallbackMethod : method;

  const applyCoupon = async () => {
    setCouponErr(null);
    const code = couponInput.trim();
    if (!code) return;
    setApplying(true);
    const res = await previewCoupon(
      code,
      groups.map((g) => ({
        storeId: g.storeId,
        itemsTotal: g.itemsTotal,
        shipping: g.shipping,
      })),
    );
    setApplying(false);
    if (res.ok && res.discount) {
      setDiscount(res.discount);
      setAppliedCode(code);
    } else {
      setDiscount(0);
      setAppliedCode("");
      setCouponErr(res.error ?? "notFound");
    }
  };

  const clearCoupon = () => {
    setDiscount(0);
    setAppliedCode("");
    setCouponInput("");
    setCouponErr(null);
  };

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
      paymentMethod: effectiveMethod,
      couponCode: appliedCode || undefined,
      redeemPoints: redeem.pointsUsed || undefined,
      shippingMethods: Object.fromEntries(
        groups.map((g) => [g.storeId, g.selectedMethod]),
      ),
    });
    if (res.error) {
      setError(res.error);
      setPlacing(false);
      return;
    }
    // Full navigation so the cart provider re-reads the now-empty server cart.
    // Instantly-settled orders (COD, wallet) go to the success page; manual
    // prepaid orders go to the order page to submit payment proof.
    const instant =
      effectiveMethod === "COD" || effectiveMethod === "HEZALLI_BALANCE";
    const dest = instant
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
          <div className="space-y-4">
            {groups.map((g, i) => {
              const feeLabel = (fee: number) =>
                fee === 0 ? (
                  <span className="font-medium text-emerald-600">
                    {t("free")}
                  </span>
                ) : (
                  <span dir="ltr">{formatUsd(fee, locale)}</span>
                );
              const eta = (o: { etaMinDays: number; etaMaxDays: number }) =>
                t("etaDays", { min: o.etaMinDays, max: o.etaMaxDays });
              return (
                <div key={i} className="space-y-2">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <StoreIcon className="text-muted-foreground size-3.5" />
                    {g.storeName}
                  </span>
                  {g.express ? (
                    <div className="space-y-2">
                      <label
                        className={cn(
                          "flex cursor-pointer items-center justify-between gap-3 rounded-md border p-2.5 text-sm",
                          g.selectedMethod === "STANDARD"
                            ? "border-primary bg-primary/5"
                            : "hover:border-muted-foreground/40",
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`ship-${g.storeId}`}
                            className="size-4"
                            checked={g.selectedMethod === "STANDARD"}
                            onChange={() =>
                              setMethodByStore((m) => ({
                                ...m,
                                [g.storeId]: "STANDARD",
                              }))
                            }
                          />
                          <span>
                            <span className="font-medium">
                              {t("standardShipping")}
                            </span>
                            {g.standard ? (
                              <span className="text-muted-foreground">
                                {" · "}
                                {eta(g.standard)}
                              </span>
                            ) : null}
                          </span>
                        </span>
                        {feeLabel(g.standard?.fee ?? 0)}
                      </label>
                      <label
                        className={cn(
                          "flex cursor-pointer items-center justify-between gap-3 rounded-md border p-2.5 text-sm",
                          g.selectedMethod === "EXPRESS"
                            ? "border-primary bg-primary/5"
                            : "hover:border-muted-foreground/40",
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`ship-${g.storeId}`}
                            className="size-4"
                            checked={g.selectedMethod === "EXPRESS"}
                            onChange={() =>
                              setMethodByStore((m) => ({
                                ...m,
                                [g.storeId]: "EXPRESS",
                              }))
                            }
                          />
                          <span>
                            <span className="font-medium">
                              {t("expressShipping")}
                            </span>
                            <span className="text-muted-foreground">
                              {" · "}
                              {eta(g.express)}
                            </span>
                            <span className="ms-1.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">
                              {t("expressBadge")}
                            </span>
                          </span>
                        </span>
                        {feeLabel(g.express.fee)}
                      </label>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between rounded-md border p-2.5 text-sm">
                      <span>
                        <span className="font-medium">
                          {t("standardShipping")}
                        </span>
                        {g.standard ? (
                          <span className="text-muted-foreground">
                            {" · "}
                            {eta(g.standard)}
                          </span>
                        ) : null}
                      </span>
                      {feeLabel(g.shipping)}
                    </div>
                  )}
                </div>
              );
            })}
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
                  "flex items-center gap-3 rounded-md border p-3 text-sm",
                  m.disabled
                    ? "cursor-not-allowed opacity-50"
                    : "cursor-pointer",
                  effectiveMethod === m.key
                    ? "border-primary bg-primary/5"
                    : !m.disabled && "hover:border-muted-foreground/40",
                )}
              >
                <input
                  type="radio"
                  name="method"
                  className="size-4"
                  checked={effectiveMethod === m.key}
                  disabled={m.disabled}
                  onChange={() => setMethod(m.key)}
                />
                <span className="font-medium">{m.label}</span>
                <span className="text-muted-foreground">{m.hint}</span>
              </label>
            ))}
          </div>
          {effectiveMethod !== "COD" &&
          effectiveMethod !== "HEZALLI_BALANCE" ? (
            <p className="text-muted-foreground mt-2 text-xs">
              {t("prepaidNote")}
            </p>
          ) : null}
          <div className="mt-3">
            {appliedCode ? (
              <div className="flex items-center justify-between rounded-md border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-sm">
                <span className="font-medium text-emerald-600">
                  {t("couponApplied", { code: appliedCode })}
                </span>
                <button
                  type="button"
                  onClick={clearCoupon}
                  className="text-muted-foreground hover:text-foreground text-xs"
                >
                  {t("removeCoupon")}
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value)}
                  placeholder={t("couponPlaceholder")}
                  className="h-9 flex-1 rounded-md border px-3 text-sm uppercase outline-none"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={applying || !couponInput.trim()}
                  onClick={applyCoupon}
                >
                  {applying ? t("applying") : t("apply")}
                </Button>
              </div>
            )}
            {couponErr ? (
              <p className="text-destructive mt-1 text-xs">
                {t(`coupon_${couponErr}`)}
              </p>
            ) : null}

            {points > 0 ? (
              <label
                className={cn(
                  "mt-3 flex items-start gap-2 text-sm",
                  !canRedeem && "opacity-50",
                )}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 size-4"
                  checked={usePoints && canRedeem}
                  disabled={!canRedeem}
                  onChange={(e) => setUsePoints(e.target.checked)}
                />
                <span>
                  {t("redeemPoints", {
                    points,
                    usd: formatUsd(pointsToUsd(points), locale),
                  })}
                </span>
              </label>
            ) : null}
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
          {discount > 0 ? (
            <div className="flex justify-between text-emerald-600">
              <span>{t("discount")}</span>
              <span dir="ltr">−{formatUsd(discount, locale)}</span>
            </div>
          ) : null}
          {redeem.discountUsd > 0 ? (
            <div className="flex justify-between text-emerald-600">
              <span>{t("pointsDiscount", { points: redeem.pointsUsed })}</span>
              <span dir="ltr">−{formatUsd(redeem.discountUsd, locale)}</span>
            </div>
          ) : null}
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
