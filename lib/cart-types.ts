// Pure cart types shared by client + server (no Prisma import).

export type CartLine = {
  variantId: string;
  storeId: string;
  storeName: string;
  storeSlug: string;
  productSlug: string;
  title: string;
  variantName: string;
  image: string | null;
  price: number;
  compareAtPrice: number | null;
  stock: number;
  quantity: number;
  // Resolved package class (product's own, else its category default) —
  // drives the checkout freight rules (no pickup, appointment required).
  sizeClass: string | null;
};

// The minimal shape persisted in localStorage for guests.
export type CartStub = {
  variantId: string;
  storeId: string;
  quantity: number;
};

export const GUEST_CART_KEY = "hezalli:cart";
export const GUEST_SAVED_KEY = "hezalli:saved";

export type CartData = { cart: CartLine[]; saved: CartLine[] };

export function cartCount(lines: { quantity: number }[]): number {
  return lines.reduce((n, l) => n + l.quantity, 0);
}
