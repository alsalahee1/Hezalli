import { NextResponse, type NextRequest } from "next/server";

import { resolveCartLines } from "@/lib/cart";
import type { CartStub } from "@/lib/cart-types";

// Resolve a guest cart (localStorage stubs) into fully-priced lines with fresh
// price/stock. Public — carries no account data.
export async function POST(req: NextRequest) {
  let body: { items?: unknown; locale?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ lines: [] });
  }
  const raw = Array.isArray(body.items) ? body.items : [];
  const items: CartStub[] = raw
    .filter(
      (i): i is CartStub =>
        Boolean(i) &&
        typeof (i as CartStub).variantId === "string" &&
        typeof (i as CartStub).quantity === "number",
    )
    .slice(0, 100)
    .map((i) => ({
      variantId: i.variantId,
      storeId: typeof i.storeId === "string" ? i.storeId : "",
      quantity: i.quantity,
    }));
  const locale = typeof body.locale === "string" ? body.locale : "en";
  const lines = await resolveCartLines(items, locale);
  return NextResponse.json({ lines });
}
