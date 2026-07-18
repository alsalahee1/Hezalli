"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useLocale } from "next-intl";

import {
  addToCart,
  mergeGuestCart,
  moveToCart as moveToCartAction,
  removeFromCart,
  saveForLater as saveForLaterAction,
  setCartQty,
} from "@/lib/actions/cart";
import {
  GUEST_CART_KEY,
  GUEST_SAVED_KEY,
  cartCount,
  type CartData,
  type CartLine,
  type CartStub,
} from "@/lib/cart-types";

export type CartNotice = {
  variantId: string;
  title: string;
  kind: "price" | "stock" | "removed";
};

type CartContextValue = {
  lines: CartLine[];
  saved: CartLine[];
  count: number;
  ready: boolean;
  addItem: (line: CartLine, qty?: number) => Promise<void>;
  setQty: (variantId: string, qty: number) => Promise<void>;
  remove: (variantId: string) => Promise<void>;
  saveForLater: (variantId: string) => Promise<void>;
  moveToCart: (variantId: string) => Promise<void>;
  refresh: () => Promise<CartNotice[]>;
};

const CartContext = createContext<CartContextValue | null>(null);

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}

function readStubs(key: string): CartStub[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function toStubs(lines: CartLine[]): CartStub[] {
  return lines.map((l) => ({
    variantId: l.variantId,
    storeId: l.storeId,
    quantity: l.quantity,
  }));
}

export function CartProvider({
  isAuthed,
  initial,
  children,
}: {
  isAuthed: boolean;
  initial: CartData;
  children: React.ReactNode;
}) {
  const locale = useLocale();
  const [lines, setLines] = useState<CartLine[]>(initial.cart);
  const [saved, setSaved] = useState<CartLine[]>(initial.saved);
  const [ready, setReady] = useState(false);

  const resolveGuest = useCallback(
    async (stubs: CartStub[]): Promise<CartLine[]> => {
      if (stubs.length === 0) return [];
      const res = await fetch("/api/cart/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: stubs, locale }),
      });
      if (!res.ok) return [];
      return ((await res.json()) as { lines: CartLine[] }).lines;
    },
    [locale],
  );

  const apply = (data: CartData) => {
    setLines(data.cart);
    setSaved(data.saved);
  };

  // Initial load: merge a guest cart on login, else hydrate from source.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const activeStubs = readStubs(GUEST_CART_KEY);
      const savedStubs = readStubs(GUEST_SAVED_KEY);
      if (isAuthed) {
        if (activeStubs.length > 0 || savedStubs.length > 0) {
          const res = await mergeGuestCart(activeStubs, savedStubs);
          try {
            localStorage.removeItem(GUEST_CART_KEY);
            localStorage.removeItem(GUEST_SAVED_KEY);
          } catch {
            /* ignore */
          }
          if (!cancelled) apply(res);
        } else if (!cancelled) {
          apply(initial);
        }
      } else {
        const [c, s] = await Promise.all([
          resolveGuest(activeStubs),
          resolveGuest(savedStubs),
        ]);
        if (!cancelled) {
          setLines(c);
          setSaved(s);
        }
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed]);

  // Persist guest carts.
  useEffect(() => {
    if (isAuthed || !ready) return;
    try {
      localStorage.setItem(GUEST_CART_KEY, JSON.stringify(toStubs(lines)));
      localStorage.setItem(GUEST_SAVED_KEY, JSON.stringify(toStubs(saved)));
    } catch {
      /* ignore */
    }
  }, [lines, saved, isAuthed, ready]);

  const addItem = useCallback(
    async (line: CartLine, qty = 1) => {
      if (isAuthed) {
        apply(await addToCart(line.variantId, qty));
        return;
      }
      setLines((prev) => {
        const idx = prev.findIndex((l) => l.variantId === line.variantId);
        if (idx >= 0) {
          const cur = prev[idx];
          const next = [...prev];
          next[idx] = {
            ...cur,
            quantity: Math.min(cur.stock, cur.quantity + qty),
          };
          return next;
        }
        return [...prev, { ...line, quantity: Math.min(line.stock, qty) }];
      });
      setSaved((prev) => prev.filter((s) => s.variantId !== line.variantId));
    },
    [isAuthed],
  );

  const setQty = useCallback(
    async (variantId: string, qty: number) => {
      if (isAuthed) {
        apply(await setCartQty(variantId, qty));
        return;
      }
      setLines((prev) =>
        prev
          .map((l) =>
            l.variantId === variantId
              ? { ...l, quantity: Math.min(l.stock, Math.max(0, qty)) }
              : l,
          )
          .filter((l) => l.quantity > 0),
      );
    },
    [isAuthed],
  );

  const remove = useCallback(
    async (variantId: string) => {
      if (isAuthed) {
        apply(await removeFromCart(variantId));
        return;
      }
      setLines((prev) => prev.filter((l) => l.variantId !== variantId));
      setSaved((prev) => prev.filter((l) => l.variantId !== variantId));
    },
    [isAuthed],
  );

  const saveForLater = useCallback(
    async (variantId: string) => {
      if (isAuthed) {
        apply(await saveForLaterAction(variantId));
        return;
      }
      const line = lines.find((l) => l.variantId === variantId);
      setLines((prev) => prev.filter((l) => l.variantId !== variantId));
      if (line)
        setSaved((prev) => [
          line,
          ...prev.filter((s) => s.variantId !== variantId),
        ]);
    },
    [isAuthed, lines],
  );

  const moveToCart = useCallback(
    async (variantId: string) => {
      if (isAuthed) {
        apply(await moveToCartAction(variantId));
        return;
      }
      const line = saved.find((s) => s.variantId === variantId);
      setSaved((prev) => prev.filter((s) => s.variantId !== variantId));
      if (line)
        setLines((prev) => {
          const idx = prev.findIndex((l) => l.variantId === variantId);
          if (idx >= 0) return prev;
          return [
            ...prev,
            { ...line, quantity: Math.min(line.stock, line.quantity) },
          ];
        });
    },
    [isAuthed, saved],
  );

  const refresh = useCallback(async (): Promise<CartNotice[]> => {
    const before = new Map(lines.map((l) => [l.variantId, l]));
    const [freshCart, freshSaved] = await Promise.all([
      resolveGuest(toStubs(lines)),
      resolveGuest(toStubs(saved)),
    ]);
    const notices: CartNotice[] = [];
    const freshIds = new Set(freshCart.map((l) => l.variantId));
    for (const [variantId, old] of before) {
      if (!freshIds.has(variantId))
        notices.push({ variantId, title: old.title, kind: "removed" });
    }
    for (const f of freshCart) {
      const old = before.get(f.variantId);
      if (!old) continue;
      if (f.stock <= 0)
        notices.push({ variantId: f.variantId, title: f.title, kind: "stock" });
      else if (f.price !== old.price)
        notices.push({ variantId: f.variantId, title: f.title, kind: "price" });
    }
    setLines(
      freshCart.map((f) => ({
        ...f,
        quantity: f.stock > 0 ? Math.min(f.quantity, f.stock) : f.quantity,
      })),
    );
    setSaved(freshSaved);
    return notices;
  }, [lines, saved, resolveGuest]);

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      saved,
      count: cartCount(lines),
      ready,
      addItem,
      setQty,
      remove,
      saveForLater,
      moveToCart,
      refresh,
    }),
    [
      lines,
      saved,
      ready,
      addItem,
      setQty,
      remove,
      saveForLater,
      moveToCart,
      refresh,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
