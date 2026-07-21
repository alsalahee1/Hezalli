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

export type PickupPointOption = {
  id: string;
  label: string;
  governorate?: string;
};

export function CheckoutFlow({
  lines,
  addresses,
  shippingByAddress,
  codEnabled = true,
  points = 0,
  walletBalance = 0,
  pickupPoints = [],
}: {
  lines: CartLine[];
  addresses: CheckoutAddress[];
  shippingByAddress: Record<string, Record<string, StoreShipOptions>>;
  codEnabled?: boolean;
  points?: number;
  walletBalance?: number;
  pickupPoints?: PickupPointOption[];
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
  // The ONE Hezalli Point the buyer collects from (when any group is PICKUP).
  const [pickupPointId, setPickupPointId] = useState("");

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
      const pickup = o?.pickup && pickupPoints.length > 0 ? o.pickup : null;
      const wanted = methodByStore[g.storeId] ?? "STANDARD";
      const selectedMethod: ShippingMethod =
        wanted === "EXPRESS" && express
          ? "EXPRESS"
          : wanted === "PICKUP" && pickup
            ? "PICKUP"
            : "STANDARD";
      const option =
        selectedMethod === "EXPRESS" && express
          ? express
          : selectedMethod === "PICKUP" && pickup
            ? pickup
            : o?.standard;
      return {
        ...g,
        itemsTotal,
        standard: o?.standard ?? null,
        express,
        pickup,
        selectedMethod,
        shipping: option?.fee ?? 0,
      };
    });
  }, [lines, shippingByAddress, addressId, methodByStore, pickupPoints]);

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
    try {
      const res = await previewCoupon(
        code,
        groups.map((g) => ({
          storeId: g.storeId,
          itemsTotal: g.itemsTotal,
          shipping: g.shipping,
        })),
      );
      if (res.ok && res.discount) {
        setDiscount(res.discount);
        setAppliedCode(code);
      } else {
        setDiscount(0);
        setAppliedCode("");
        setCouponErr(res.error ?? "notFound");
      }
    } catch {
      // Network / server failure — surface a retryable message instead of
      // leaving the button stuck in its pending state.
      setCouponErr("serverError");
    } finally {
      setApplying(false);
    }
  };

  const clearCoupon = () => {
    setDiscount(0);
    setAppliedCode("");
    setCouponInput("");
    setCouponErr(null);
  };

  const anyPickup = groups.some((g) => g.selectedMethod === "PICKUP");

  // Nearest points first for the selected delivery address (same-governorate
  // matches lead; the server already filtered out full points).
  const addressGov = addresses.find((a) => a.id === addressId)?.governorate;
  const sortedPickupPoints = useMemo(
    () =>
      [...pickupPoints].sort(
        (a, b) =>
          (a.governorate === addressGov ? 0 : 1) -
          (b.governorate === addressGov ? 0 : 1),
      ),
    [pickupPoints, addressGov],
  );

  const submit = async () => {
    setError(null);
    if (!addressId) {
      setError("addressRequired");
      return;
    }
    if (anyPickup && !pickupPointId) {
      setError("pickupPointRequired");
      return;
    }
    setPlacing(true);
    try {
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
        pickupPointId: anyPickup ? pickupPointId : undefined,
      });
      if (res.error) {
        setError(res.error);
        setPlacing(false);
        return;
      }
      // Full navigation so the cart provider re-reads the now-empty server cart.
      // Instantly-settled orders (COD, wallet) go to the success page; manual
      // prepaid orders go to the order page to submit payment proof. Leave the
      // button disabled while the page navigates away.
      const instant =
        effectiveMethod === "COD" || effectiveMethod === "HEZALLI_BALANCE";
      const dest = instant
        ? `/${locale}/checkout/success?order=${res.orderId}`
        : `/${locale}/account/orders/${res.orderId}`;
      window.location.assign(dest);
    } catch {
      // A flaky connection must not brick the Place Order button permanently.
      setError("serverError");
      setPlacing(false);
    }
  };

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_340px]">
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
                  {g.express || g.pickup ? (
                    <div className="space-y-2">
                      {(
                        [
                          {
                            method: "STANDARD" as const,
                            label: t("standardShipping"),
                            opt: g.standard,
                            badge: null,
                          },
                          ...(g.express
                            ? [
                                {
                                  method: "EXPRESS" as const,
                                  label: t("expressShipping"),
                                  opt: g.express,
                                  badge: t("expressBadge"),
                                },
                              ]
                            : []),
                          ...(g.pickup
                            ? [
                                {
                                  method: "PICKUP" as const,
                                  label: t("pickupShipping"),
                                  opt: g.pickup,
                                  badge: t("pickupBadge"),
                                },
                              ]
                            : []),
                        ] as const
                      ).map((row) => (
                        <label
                          key={row.method}
                          className={cn(
                            "flex cursor-pointer items-center justify-between gap-3 rounded-md border p-2.5 text-sm",
                            g.selectedMethod === row.method
                              ? "border-primary bg-primary/5"
                              : "hover:border-muted-foreground/40",
                          )}
                        >
                          <span className="flex items-center gap-2">
                            <input
                              type="radio"
                              name={`ship-${g.storeId}`}
                              className="size-4"
                              checked={g.selectedMethod === row.method}
                              onChange={() =>
                                setMethodByStore((m) => ({
                                  ...m,
                                  [g.storeId]: row.method,
                                }))
                              }
                            />
                            <span>
                              <span className="font-medium">{row.label}</span>
                              {row.opt ? (
                                <span className="text-muted-foreground">
                                  {" · "}
                                  {eta(row.opt)}
                                </span>
                              ) : null}
                              {row.badge ? (
                                <span className="ms-1.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">
                                  {row.badge}
                                </span>
                              ) : null}
                            </span>
                          </span>
                          {feeLabel(row.opt?.fee ?? 0)}
                        </label>
                      ))}
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

            {/* One collection point for the whole order. */}
            {anyPickup ? (
              <div className="space-y-1.5 rounded-md border border-sky-500/40 bg-sky-500/5 p-3">
                <label className="text-sm font-medium" htmlFor="pickup-point">
                  {t("pickupPointLabel")}
                </label>
                <select
                  id="pickup-point"
                  value={pickupPointId}
                  onChange={(e) => setPickupPointId(e.target.value)}
                  className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                >
                  <option value="">{t("pickupPointPlaceholder")}</option>
                  {sortedPickupPoints.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <p className="text-muted-foreground text-xs">
                  {t("pickupPointHint")}{" "}
                  <Link
                    href="/points"
                    target="_blank"
                    className="text-primary hover:underline"
                  >
                    {t("pickupPointsDirectory")}
                  </Link>
                </p>
              </div>
            ) : null}
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
      <aside className="h-fit rounded-lg border p-4 md:sticky md:top-24">
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
