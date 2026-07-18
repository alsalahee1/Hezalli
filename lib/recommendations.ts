// "Customers also bought" — simple co-purchase recommendations. For a product,
// find the products most often bought in the SAME orders, ranked by the number
// of distinct co-purchase orders. No ML: a single grouped query over order
// history. Only ACTIVE products from ACTIVE stores are returned.
import { prisma } from "@/lib/prisma";

export async function coPurchasedProductIds(
  productId: string,
  limit = 8,
): Promise<string[]> {
  // ${productId}/${limit} are bound parameters (no SQL injection).
  const rows = await prisma.$queryRaw<{ productId: string }[]>`
    WITH orders_with_product AS (
      SELECT DISTINCT so."orderId"
      FROM "OrderItem" oi
      JOIN "ProductVariant" v ON v.id = oi."variantId"
      JOIN "SubOrder" so ON so.id = oi."subOrderId"
      WHERE v."productId" = ${productId}
    )
    SELECT v2."productId" AS "productId", COUNT(DISTINCT so2."orderId")::int AS n
    FROM "SubOrder" so2
    JOIN "OrderItem" oi2 ON oi2."subOrderId" = so2.id
    JOIN "ProductVariant" v2 ON v2.id = oi2."variantId"
    JOIN "Product" p2 ON p2.id = v2."productId"
    JOIN "Store" s2 ON s2.id = p2."storeId"
    WHERE so2."orderId" IN (SELECT "orderId" FROM orders_with_product)
      AND v2."productId" <> ${productId}
      AND p2.status = 'ACTIVE'
      AND s2.status = 'ACTIVE'
    GROUP BY v2."productId"
    ORDER BY n DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => r.productId);
}
