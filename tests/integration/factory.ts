// Builds a self-contained commerce graph (seller → store → product → variant,
// plus a buyer + address) for integration tests, with a cleanup() that removes
// everything it created. Each call uses unique slugs/skus/emails so suites can
// run against the same database without colliding.
import { getBalanceId } from "@/lib/finance";
import { prisma } from "@/lib/prisma";

let seq = 0;
const uid = (p: string) => {
  seq += 1;
  return `${p}-t${Date.now().toString(36)}-${seq}`;
};

export type PaymentChoice = "COD" | "BANK_TRANSFER" | "USDT" | "WALLET";

export async function makeFixture(
  opts: { stock?: number; price?: number; commissionRate?: number } = {},
) {
  const price = opts.price ?? 100;
  const stock = opts.stock ?? 100;
  const commissionRate = opts.commissionRate ?? 0.1;

  const sellerUser = await prisma.user.create({
    data: {
      email: `${uid("seller")}@t.local`,
      name: "Test Seller",
      roles: ["SELLER"],
      locale: "en",
    },
  });
  const sellerProfile = await prisma.sellerProfile.create({
    data: { userId: sellerUser.id },
  });
  const store = await prisma.store.create({
    data: {
      sellerId: sellerProfile.id,
      name: "Test Store",
      slug: uid("store"),
    },
  });
  const balanceId = await getBalanceId(sellerProfile.id);
  const category = await prisma.category.create({
    data: { name: { en: "Test", ar: "اختبار" }, slug: uid("cat") },
  });
  const product = await prisma.product.create({
    data: {
      storeId: store.id,
      categoryId: category.id,
      title: { en: "Test Product", ar: "منتج تجريبي" },
      slug: uid("prod"),
      basePrice: price,
      status: "ACTIVE",
      variants: {
        create: { sku: uid("sku"), name: "Default", price, stock },
      },
    },
    include: { variants: true },
  });
  const variant = product.variants[0];
  const buyer = await prisma.user.create({
    data: {
      email: `${uid("buyer")}@t.local`,
      name: "Test Buyer",
      roles: ["BUYER"],
      locale: "en",
    },
  });
  const address = await prisma.address.create({
    data: {
      userId: buyer.id,
      fullName: "Test Buyer",
      phone: "770000000",
      governorate: "Aden",
      city: "Aden",
      line1: "Street 1",
    },
  });

  return {
    sellerUserId: sellerUser.id,
    sellerProfileId: sellerProfile.id,
    storeId: store.id,
    balanceId,
    categoryId: category.id,
    productId: product.id,
    variantId: variant.id,
    variantSku: variant.sku,
    buyerId: buyer.id,
    addressId: address.id,
    price,
    commissionRate,

    async createSubOrder(o: {
      paymentMethod: PaymentChoice;
      qty?: number;
      status?: string;
      discount?: number;
    }) {
      const qty = o.qty ?? 1;
      const itemsTotal = price * qty;
      const discount = o.discount ?? 0;
      const grand = itemsTotal - discount;
      const prepaid = o.paymentMethod !== "COD";
      const status = o.status ?? "COMPLETED";
      const order = await prisma.order.create({
        data: {
          buyer: { connect: { id: buyer.id } },
          address: { connect: { id: address.id } },
          status: status as never,
          paymentMethod: o.paymentMethod as never,
          itemsTotal,
          shippingTotal: 0,
          discountTotal: discount,
          grandTotal: grand,
          displayCurrency: "USD",
          exchangeRate: 1,
          displayTotal: grand,
          subOrders: {
            create: [
              {
                store: { connect: { id: store.id } },
                status: status as never,
                itemsTotal,
                shippingTotal: 0,
                discountTotal: discount,
                commissionRate,
                commissionAmt: 0,
                sellerNet: 0,
                items: {
                  create: [
                    {
                      variantId: variant.id,
                      titleSnapshot: "Test Product",
                      skuSnapshot: variant.sku,
                      unitPrice: price,
                      quantity: qty,
                      lineTotal: itemsTotal,
                    },
                  ],
                },
              },
            ],
          },
          payment: {
            create: {
              method: o.paymentMethod as never,
              status: (prepaid ? "CONFIRMED" : "PENDING") as never,
              amountUsd: grand,
              confirmedAt: prepaid ? new Date() : null,
            },
          },
        },
        include: { subOrders: true },
      });
      return {
        orderId: order.id,
        subOrderId: order.subOrders[0].id,
        itemsTotal,
      };
    },

    async cleanup() {
      await prisma.notification
        .deleteMany({ where: { userId: { in: [buyer.id, sellerUser.id] } } })
        .catch(() => {});
      await prisma.ledgerEntry
        .deleteMany({ where: { balanceId } })
        .catch(() => {});
      await prisma.order
        .deleteMany({ where: { buyerId: buyer.id } })
        .catch(() => {});
      await prisma.product
        .deleteMany({ where: { storeId: store.id } })
        .catch(() => {});
      await prisma.category
        .delete({ where: { id: category.id } })
        .catch(() => {});
      await prisma.user.delete({ where: { id: buyer.id } }).catch(() => {});
      await prisma.user
        .delete({ where: { id: sellerUser.id } })
        .catch(() => {});
    },
  };
}
