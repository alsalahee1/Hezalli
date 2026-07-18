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
  removeFromCart,
  setCartQty,
} from "@/lib/actions/cart";
import {
  GUEST_CART_KEY,
  cartCount,
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
  count: number;
  ready: boolean;
  addItem: (line: CartLine, qty?: number) => Promise<void>;
  setQty: (variantId: string, qty: number) => Promise<void>;
  remove: (variantId: string) => Promise<void>;
  refresh: () => Promise<CartNotice[]>;
};

const CartContext = createContext<CartContextValue | null>(null);

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}

function readStubs(): CartStub[] {
  try {
    const raw = localStorage.getItem(GUEST_CART_KEY);
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
  initial: CartLine[];
  children: React.ReactNode;
}) {
  const locale = useLocale();
  const [lines, setLines] = useState<CartLine[]>(initial);
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
      const data = (await res.json()) as { lines: CartLine[] };
      return data.lines;
    },
    [locale],
  );

  // Initial load: merge a guest cart on login, otherwise hydrate from the
  // right source.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stubs = readStubs();
      if (isAuthed) {
        if (stubs.length > 0) {
          const res = await mergeGuestCart(stubs);
          try {
            localStorage.removeItem(GUEST_CART_KEY);
          } catch {
            /* ignore */
          }
          if (!cancelled) setLines(res.lines);
        } else if (!cancelled) {
          setLines(initial);
        }
      } else {
        const resolved = await resolveGuest(stubs);
        if (!cancelled) setLines(resolved);
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed]);

  // Persist guest carts to localStorage.
  useEffect(() => {
    if (isAuthed || !ready) return;
    try {
      localStorage.setItem(GUEST_CART_KEY, JSON.stringify(toStubs(lines)));
    } catch {
      /* ignore */
    }
  }, [lines, isAuthed, ready]);

  const addItem = useCallback(
    async (line: CartLine, qty = 1) => {
      if (isAuthed) {
        const res = await addToCart(line.variantId, qty);
        setLines(res.lines);
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
    },
    [isAuthed],
  );

  const setQty = useCallback(
    async (variantId: string, qty: number) => {
      if (isAuthed) {
        const res = await setCartQty(variantId, qty);
        setLines(res.lines);
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
        const res = await removeFromCart(variantId);
        setLines(res.lines);
        return;
      }
      setLines((prev) => prev.filter((l) => l.variantId !== variantId));
    },
    [isAuthed],
  );

  const refresh = useCallback(async (): Promise<CartNotice[]> => {
    const before = new Map(lines.map((l) => [l.variantId, l]));
    let fresh: CartLine[];
    if (isAuthed) {
      const res = await fetch("/api/cart/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: toStubs(lines), locale }),
      });
      fresh = res.ok ? ((await res.json()).lines as CartLine[]) : lines;
    } else {
      fresh = await resolveGuest(toStubs(lines));
    }
    const notices: CartNotice[] = [];
    const freshIds = new Set(fresh.map((l) => l.variantId));
    for (const [variantId, old] of before) {
      if (!freshIds.has(variantId)) {
        notices.push({ variantId, title: old.title, kind: "removed" });
      }
    }
    for (const f of fresh) {
      const old = before.get(f.variantId);
      if (!old) continue;
      if (f.stock <= 0)
        notices.push({ variantId: f.variantId, title: f.title, kind: "stock" });
      else if (f.price !== old.price)
        notices.push({ variantId: f.variantId, title: f.title, kind: "price" });
    }
    // Clamp quantities to fresh stock (keep out-of-stock lines visible so the
    // buyer sees why they can't be checked out).
    setLines(
      fresh.map((f) => ({
        ...f,
        quantity: f.stock > 0 ? Math.min(f.quantity, f.stock) : f.quantity,
      })),
    );
    return notices;
  }, [isAuthed, lines, locale, resolveGuest]);

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      count: cartCount(lines),
      ready,
      addItem,
      setQty,
      remove,
      refresh,
    }),
    [lines, ready, addItem, setQty, remove, refresh],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
