// Tool definitions + executors for the Gemini storefront assistant.
//
// Each tool has a declaration (sent to the model) and a runner (executed
// server-side when the model calls it). Runners return two things:
//   - `result`: a compact JSON object fed back to the model to reason over.
//   - `cards`:  optional product cards surfaced directly in the chat UI.
// All data comes from the real catalog/orders, so the assistant can only talk
// about products and orders that actually exist.
import "server-only";

import { localizedName } from "@/lib/categories";
import { formatUsd } from "@/lib/products";
import { prisma } from "@/lib/prisma";
import { getListing } from "@/lib/search";

import type { FunctionCall, FunctionDeclaration } from "./gemini";

export type ProductCard = {
  slug: string;
  title: string;
  priceLabel: string;
  compareAtLabel: string | null;
  cover: string | null;
  rating: number;
  ratingCount: number;
  storeName?: string;
  outOfStock: boolean;
};

// Which part of the platform the user is talking to Shadi from. The widget
// reports it from the current route; the API downgrades it to "store" when the
// user lacks the matching role. Messaging channels (Telegram/WhatsApp) always
// run as "store".
export type AssistantSection =
  "store" | "seller" | "admin" | "wallet" | "driver" | "point" | "fleet";

export type ToolContext = {
  locale: string;
  userId: string | null;
  // Tailors the system prompt to where the user is. Defaults to "store".
  section?: AssistantSection;
};

export type ToolResult = {
  result: Record<string, unknown>;
  cards?: ProductCard[];
};

export const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "search_products",
    description:
      "Search the Hezalli marketplace catalog for products matching a query. " +
      "Use this whenever the shopper asks to find, buy, compare, or get " +
      "recommendations for products. Returns the top matches with price and rating.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "What the shopper is looking for, e.g. 'wireless headphones' or 'red running shoes'.",
        },
        minPrice: {
          type: "number",
          description: "Minimum price in USD. Omit if not specified.",
        },
        maxPrice: {
          type: "number",
          description: "Maximum price in USD. Omit if not specified.",
        },
        condition: {
          type: "string",
          enum: ["NEW", "USED"],
          description: "Filter by item condition. Omit for any condition.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_product_details",
    description:
      "Get full details for a single product by its slug (from a previous " +
      "search result), including description, price range, available variants, " +
      "stock and store. Use before answering detailed questions about one item.",
    parameters: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description: "The product slug returned by search_products.",
        },
      },
      required: ["slug"],
    },
  },
  {
    name: "get_order_status",
    description:
      "Look up the signed-in shopper's own orders. Use for questions like " +
      "'where is my order' or 'what did I buy'. Only works when the shopper is " +
      "logged in. Optionally pass an order id to look up one specific order.",
    parameters: {
      type: "object",
      properties: {
        orderId: {
          type: "string",
          description:
            "A specific order id to look up. Omit to list the shopper's recent orders.",
        },
      },
    },
  },
];

// --- Runners ------------------------------------------------------------

async function searchProducts(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const query = String(args.query ?? "").trim();
  if (!query) return { result: { error: "empty query" } };

  const sp: Record<string, string> = { q: query, sort: "relevance" };
  if (typeof args.minPrice === "number") sp.minPrice = String(args.minPrice);
  if (typeof args.maxPrice === "number") sp.maxPrice = String(args.maxPrice);
  if (args.condition === "NEW" || args.condition === "USED")
    sp.condition = String(args.condition);

  const listing = await getListing(sp, ctx.locale);
  const top = listing.items.slice(0, 6);

  const cards: ProductCard[] = top.map((p) => ({
    slug: p.slug,
    title: p.title,
    priceLabel: p.priceLabel,
    compareAtLabel: p.compareAtLabel,
    cover: p.cover,
    rating: p.rating,
    ratingCount: p.ratingCount,
    storeName: p.storeName,
    outOfStock: p.outOfStock,
  }));

  return {
    result: {
      total: listing.total,
      showing: top.length,
      products: top.map((p) => ({
        slug: p.slug,
        title: p.title,
        price: p.priceLabel,
        wasPrice: p.compareAtLabel,
        rating: p.rating,
        ratingCount: p.ratingCount,
        store: p.storeName,
        inStock: !p.outOfStock,
      })),
    },
    cards,
  };
}

async function getProductDetails(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const slug = String(args.slug ?? "").trim();
  if (!slug) return { result: { error: "missing slug" } };

  const p = await prisma.product.findFirst({
    where: {
      slug,
      status: "ACTIVE",
      store: { status: "ACTIVE", isOnVacation: false },
    },
    select: {
      slug: true,
      title: true,
      description: true,
      condition: true,
      ratingAvg: true,
      ratingCount: true,
      images: { orderBy: { position: "asc" }, take: 1, select: { url: true } },
      category: { select: { name: true } },
      brand: { select: { name: true } },
      store: { select: { name: true } },
      variants: {
        where: { isActive: true },
        select: { name: true, price: true, stock: true },
      },
    },
  });

  if (!p) return { result: { error: "product not found or unavailable" } };

  const prices = p.variants.map((v) => Number(v.price));
  const min = prices.length ? Math.min(...prices) : 0;
  const max = prices.length ? Math.max(...prices) : 0;
  const totalStock = p.variants.reduce((s, v) => s + (v.stock ?? 0), 0);

  const card: ProductCard = {
    slug: p.slug,
    title: localizedName(p.title, ctx.locale),
    priceLabel:
      max > min
        ? `${formatUsd(min, ctx.locale)} – ${formatUsd(max, ctx.locale)}`
        : formatUsd(min, ctx.locale),
    compareAtLabel: null,
    cover: p.images[0]?.url ?? null,
    rating: p.ratingAvg,
    ratingCount: p.ratingCount,
    storeName: p.store.name,
    outOfStock: totalStock <= 0,
  };

  return {
    result: {
      slug: p.slug,
      title: localizedName(p.title, ctx.locale),
      description: p.description
        ? localizedName(p.description, ctx.locale)
        : null,
      condition: p.condition,
      category: localizedName(p.category.name, ctx.locale),
      brand: p.brand?.name ?? null,
      store: p.store.name,
      priceRange: card.priceLabel,
      rating: p.ratingAvg,
      ratingCount: p.ratingCount,
      inStock: totalStock > 0,
      variants: p.variants.map((v) => ({
        name: v.name,
        price: formatUsd(Number(v.price), ctx.locale),
        inStock: (v.stock ?? 0) > 0,
      })),
    },
    cards: [card],
  };
}

async function getOrderStatus(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  if (!ctx.userId) {
    return {
      result: {
        error: "not_signed_in",
        message: "The shopper must sign in to view their orders.",
      },
    };
  }

  const orderId = String(args.orderId ?? "").trim();
  const orders = await prisma.order.findMany({
    where: { buyerId: ctx.userId, ...(orderId ? { id: orderId } : {}) },
    orderBy: { createdAt: "desc" },
    take: orderId ? 1 : 5,
    select: {
      id: true,
      status: true,
      grandTotal: true,
      createdAt: true,
      subOrders: {
        select: {
          status: true,
          store: { select: { name: true } },
          shipment: { select: { trackingNumber: true, status: true } },
        },
      },
    },
  });

  if (orders.length === 0) {
    return {
      result: { message: orderId ? "order not found" : "no orders yet" },
    };
  }

  return {
    result: {
      orders: orders.map((o) => ({
        id: o.id,
        status: o.status,
        total: formatUsd(Number(o.grandTotal), ctx.locale),
        placedAt: o.createdAt.toISOString().slice(0, 10),
        shipments: o.subOrders.map((s) => ({
          store: s.store.name,
          status: s.status,
          tracking: s.shipment?.trackingNumber ?? null,
        })),
      })),
    },
  };
}

const RUNNERS: Record<
  string,
  (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>
> = {
  search_products: searchProducts,
  get_product_details: getProductDetails,
  get_order_status: getOrderStatus,
};

/** Execute a model-requested tool call. Never throws — errors become results. */
export async function runTool(
  call: FunctionCall,
  ctx: ToolContext,
): Promise<ToolResult> {
  const runner = RUNNERS[call.name];
  if (!runner) return { result: { error: `unknown tool: ${call.name}` } };
  try {
    return await runner(call.args ?? {}, ctx);
  } catch (err) {
    return {
      result: {
        error: "tool_failed",
        message: err instanceof Error ? err.message : "unknown error",
      },
    };
  }
}
