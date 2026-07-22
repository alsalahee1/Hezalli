/**
 * Database seed script (Step 2.2).
 *
 * Populates a fresh database with realistic Hezalli test data:
 *   - platform settings + exchange rates (USD base)
 *   - 10 launch categories (from docs/DECISIONS.md)
 *   - brands, carriers, shipping zones + rates
 *   - 1 admin, 2 sellers (+ stores + balances), 3 buyers (+ addresses)
 *   - ~60 products across all categories: variants (colour/size/storage),
 *     sale prices, used goods, drafts, and one moderated (hidden) listing
 *   - orders (COD / USDT / wallet) with sub-orders, payments, ledger — some
 *     completed & delivered so returns/disputes have something to attach to
 *   - carts (incl. saved-for-later), wishlists, recently viewed, store follows
 *   - buyer↔store chat threads and a spread of notifications per user
 *   - loyalty points + a referral link, a return request, and an open dispute
 *   - extra coupons (seller / fixed / free-shipping / expired), an active
 *     flash sale, seller payout methods + a payout request, and banners
 *
 * Dev login password for every seeded user: "hezalli123".
 * Run with: npm run db:seed
 */
import "dotenv/config";

import { CMS_SEEDS } from "../lib/cms-content";
import { LAUNCH_CATEGORIES as CATEGORIES } from "../lib/launch-categories";
import { hashPassword } from "../lib/password";
import { prisma } from "../lib/prisma";
import { slugify } from "../lib/slug";

async function clearDatabase() {
  // Delete in child → parent order so foreign keys are satisfied.
  await prisma.couponRedemption.deleteMany();
  await prisma.coupon.deleteMany();
  await prisma.flashSaleItem.deleteMany();
  await prisma.flashSale.deleteMany();
  await prisma.reviewImage.deleteMany();
  await prisma.review.deleteMany();
  await prisma.disputeMessage.deleteMany();
  await prisma.dispute.deleteMany();
  await prisma.returnItem.deleteMany();
  await prisma.returnRequest.deleteMany();
  await prisma.shipmentEvent.deleteMany();
  await prisma.shipment.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.orderStatusHistory.deleteMany();
  await prisma.refund.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.subOrder.deleteMany();
  await prisma.order.deleteMany();
  await prisma.ledgerEntry.deleteMany();
  await prisma.payout.deleteMany();
  await prisma.sellerBalance.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.cart.deleteMany();
  await prisma.wishlistItem.deleteMany();
  await prisma.wishlist.deleteMany();
  await prisma.recentlyViewed.deleteMany();
  await prisma.productImage.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.shippingRate.deleteMany();
  await prisma.shippingZone.deleteMany();
  await prisma.carrier.deleteMany();
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.payoutMethod.deleteMany();
  await prisma.store.deleteMany();
  await prisma.sellerProfile.deleteMany();
  await prisma.address.deleteMany();
  await prisma.account.deleteMany();
  await prisma.session.deleteMany();
  await prisma.otpToken.deleteMany();
  await prisma.verificationToken.deleteMany();
  await prisma.category.deleteMany();
  await prisma.brand.deleteMany();
  await prisma.exchangeRate.deleteMany();
  await prisma.platformSetting.deleteMany();
  await prisma.cmsPage.deleteMany();
  await prisma.banner.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();
}

const BRANDS = [
  "Samsung",
  "Apple",
  "Anker",
  "Adidas",
  "Sony",
  "LG",
  "HP",
  "Xiaomi",
  "JBL",
  "Nike",
  "Philips",
  "Bosch",
  "Nivea",
  "Wilson",
  "Lego",
  "Generic",
];

/**
 * A seed product definition. `options` describes variant axes (e.g. colour ×
 * size); the loader builds one variant per combination (Cartesian product).
 * Without `options` a single default variant is created (fashion items still
 * fall back to S/L for backward compatibility). `compareAt` seeds a strike-
 * through "was" price, `condition` marks used goods, and `status` +
 * `moderationReason` let the seed reflect draft / moderated states.
 */
type SeedProductDef = {
  en: string;
  ar: string;
  cat: string;
  brand: string;
  price: number;
  store: number;
  condition?: "NEW" | "USED";
  compareAt?: number;
  stock?: number;
  status?: "ACTIVE" | "DRAFT" | "HIDDEN";
  moderationReason?: string;
  options?: { name: string; values: string[] }[];
};

// storeIdx: 0 = Sana'a Electronics, 1 = Aden Fashion House
const PRODUCTS: SeedProductDef[] = [
  {
    en: 'Samsung 55" 4K Smart TV',
    ar: "تلفزيون سامسونج ذكي 55 بوصة 4K",
    cat: "electronics",
    brand: "Samsung",
    price: 499,
    store: 0,
  },
  {
    en: "Apple iPhone 15 128GB",
    ar: "آيفون 15 128 جيجابايت",
    cat: "phones-accessories",
    brand: "Apple",
    price: 799,
    store: 0,
  },
  {
    en: "Anker PowerCore 20000 Power Bank",
    ar: "باور بانك أنكر 20000",
    cat: "phones-accessories",
    brand: "Anker",
    price: 39,
    store: 0,
  },
  {
    en: "Samsung Galaxy Buds2",
    ar: "سماعات سامسونج جالكسي بدز 2",
    cat: "electronics",
    brand: "Samsung",
    price: 89,
    store: 0,
  },
  {
    en: "Wireless Keyboard & Mouse Combo",
    ar: "لوحة مفاتيح وماوس لاسلكي",
    cat: "electronics",
    brand: "Generic",
    price: 25,
    store: 0,
  },
  {
    en: "Stainless Steel Cookware Set 10pc",
    ar: "طقم أواني طهي ستانلس ستيل 10 قطع",
    cat: "home-kitchen",
    brand: "Generic",
    price: 79,
    store: 0,
  },
  {
    en: "Electric Kettle 1.8L",
    ar: "غلاية كهربائية 1.8 لتر",
    cat: "home-kitchen",
    brand: "Generic",
    price: 22,
    store: 0,
  },
  {
    en: "Yoga Mat Non-Slip",
    ar: "سجادة يوغا مانعة للانزلاق",
    cat: "sports-outdoors",
    brand: "Generic",
    price: 18,
    store: 0,
  },
  {
    en: "Car Phone Holder Magnetic",
    ar: "حامل هاتف مغناطيسي للسيارة",
    cat: "automotive-tools",
    brand: "Generic",
    price: 9,
    store: 0,
  },
  {
    en: "LED Desk Lamp",
    ar: "مصباح مكتب LED",
    cat: "home-kitchen",
    brand: "Generic",
    price: 15,
    store: 0,
  },
  {
    en: "Men's Cotton T-Shirt",
    ar: "تيشيرت قطني رجالي",
    cat: "fashion-apparel",
    brand: "Generic",
    price: 12,
    store: 1,
  },
  {
    en: "Women's Abaya Classic Black",
    ar: "عباية نسائية كلاسيكية سوداء",
    cat: "fashion-apparel",
    brand: "Generic",
    price: 35,
    store: 1,
  },
  {
    en: "Kids' Sneakers",
    ar: "حذاء رياضي للأطفال",
    cat: "fashion-apparel",
    brand: "Adidas",
    price: 29,
    store: 1,
  },
  {
    en: "Oud Perfume 50ml",
    ar: "عطر عود 50 مل",
    cat: "health-beauty",
    brand: "Generic",
    price: 45,
    store: 1,
  },
  {
    en: "Moisturizing Face Cream",
    ar: "كريم مرطب للوجه",
    cat: "health-beauty",
    brand: "Generic",
    price: 14,
    store: 1,
  },
  {
    en: "Organic Sidr Honey 500g",
    ar: "عسل سدر عضوي 500 جرام",
    cat: "groceries-food",
    brand: "Generic",
    price: 28,
    store: 1,
  },
  {
    en: "Yemeni Coffee Beans 250g",
    ar: "حبوب قهوة يمنية 250 جرام",
    cat: "groceries-food",
    brand: "Generic",
    price: 11,
    store: 1,
  },
  {
    en: "Baby Diapers Pack",
    ar: "حفاضات أطفال",
    cat: "baby-kids-toys",
    brand: "Generic",
    price: 19,
    store: 1,
  },
  {
    en: "Building Blocks Toy Set",
    ar: "مكعبات بناء للأطفال",
    cat: "baby-kids-toys",
    brand: "Generic",
    price: 16,
    store: 1,
  },
  {
    en: "Arabic Novel Collection",
    ar: "مجموعة روايات عربية",
    cat: "books-stationery",
    brand: "Generic",
    price: 24,
    store: 1,
  },

  // ---- Additional catalogue (indices 20+). The first 20 above are
  // referenced by index in the order seeding below and must not move. ----

  // Electronics (store 0)
  {
    en: "Sony WH-1000XM5 Headphones",
    ar: "سماعات سوني WH-1000XM5",
    cat: "electronics",
    brand: "Sony",
    price: 349,
    compareAt: 399,
    store: 0,
    options: [{ name: "color", values: ["Black", "Silver"] }],
  },
  {
    en: 'LG 27" Gaming Monitor',
    ar: "شاشة ألعاب LG 27 بوصة",
    cat: "electronics",
    brand: "LG",
    price: 219,
    store: 0,
  },
  {
    en: "HP Pavilion Laptop 15",
    ar: "لابتوب HP Pavilion 15",
    cat: "electronics",
    brand: "HP",
    price: 649,
    store: 0,
    options: [{ name: "storage", values: ["256GB", "512GB"] }],
  },
  {
    en: "JBL Flip 6 Bluetooth Speaker",
    ar: "مكبر صوت JBL Flip 6",
    cat: "electronics",
    brand: "JBL",
    price: 99,
    compareAt: 129,
    store: 0,
    options: [{ name: "color", values: ["Black", "Blue", "Red"] }],
  },

  // Phones & Accessories (store 0)
  {
    en: "Xiaomi Redmi Note 13",
    ar: "شاومي ريدمي نوت 13",
    cat: "phones-accessories",
    brand: "Xiaomi",
    price: 199,
    store: 0,
    options: [{ name: "storage", values: ["128GB", "256GB"] }],
  },
  {
    en: "Samsung Galaxy A54 5G",
    ar: "سامسونج جالكسي A54 الجيل الخامس",
    cat: "phones-accessories",
    brand: "Samsung",
    price: 349,
    store: 0,
    options: [
      { name: "color", values: ["Black", "Violet"] },
      { name: "storage", values: ["128GB", "256GB"] },
    ],
  },
  {
    en: "Anker USB-C Charger 65W",
    ar: "شاحن أنكر USB-C 65 واط",
    cat: "phones-accessories",
    brand: "Anker",
    price: 29,
    store: 0,
  },
  {
    en: "Tempered Glass Screen Protector",
    ar: "واقي شاشة زجاجي",
    cat: "phones-accessories",
    brand: "Generic",
    price: 5,
    stock: 6,
    store: 0,
  },

  // Home & Kitchen (store 0)
  {
    en: "Philips Air Fryer 4.1L",
    ar: "قلاية هوائية فيليبس 4.1 لتر",
    cat: "home-kitchen",
    brand: "Philips",
    price: 119,
    compareAt: 149,
    store: 0,
  },
  {
    en: "Robot Vacuum Cleaner",
    ar: "مكنسة روبوت ذكية",
    cat: "home-kitchen",
    brand: "Xiaomi",
    price: 179,
    store: 0,
  },
  {
    en: "Non-Stick Frying Pan 28cm",
    ar: "مقلاة غير لاصقة 28 سم",
    cat: "home-kitchen",
    brand: "Generic",
    price: 17,
    store: 0,
  },

  // Sports & Outdoors (store 0)
  {
    en: "Adjustable Dumbbell Set 20kg",
    ar: "طقم دمبل قابل للتعديل 20 كجم",
    cat: "sports-outdoors",
    brand: "Generic",
    price: 89,
    store: 0,
  },
  {
    en: "Wilson Tennis Racket",
    ar: "مضرب تنس ويلسون",
    cat: "sports-outdoors",
    brand: "Wilson",
    price: 59,
    compareAt: 79,
    condition: "USED",
    store: 0,
  },
  {
    en: "Camping Tent 4-Person",
    ar: "خيمة تخييم لـ 4 أشخاص",
    cat: "sports-outdoors",
    brand: "Generic",
    price: 79,
    store: 0,
    options: [{ name: "color", values: ["Green", "Blue"] }],
  },
  {
    en: "Insulated Water Bottle 1L",
    ar: "زجاجة ماء حرارية 1 لتر",
    cat: "sports-outdoors",
    brand: "Generic",
    price: 14,
    store: 0,
    options: [{ name: "color", values: ["Black", "Silver", "Pink"] }],
  },
  {
    en: "Football Size 5",
    ar: "كرة قدم مقاس 5",
    cat: "sports-outdoors",
    brand: "Nike",
    price: 25,
    store: 0,
  },

  // Automotive & Tools (store 0)
  {
    en: "Portable Car Vacuum Cleaner",
    ar: "مكنسة سيارة محمولة",
    cat: "automotive-tools",
    brand: "Generic",
    price: 24,
    store: 0,
  },
  {
    en: "Cordless Drill 18V",
    ar: "مثقاب لاسلكي 18 فولت",
    cat: "automotive-tools",
    brand: "Bosch",
    price: 69,
    store: 0,
  },
  {
    en: "Car Dash Cam Full HD",
    ar: "كاميرا سيارة أمامية Full HD",
    cat: "automotive-tools",
    brand: "Generic",
    price: 39,
    store: 0,
  },
  {
    en: "Digital Tire Inflator",
    ar: "منفاخ إطارات رقمي",
    cat: "automotive-tools",
    brand: "Generic",
    price: 32,
    store: 0,
    status: "DRAFT",
  },
  {
    en: "Socket Wrench Set 40pc",
    ar: "طقم مفاتيح ربط 40 قطعة",
    cat: "automotive-tools",
    brand: "Bosch",
    price: 45,
    compareAt: 60,
    condition: "USED",
    store: 0,
  },

  // Fashion & Apparel (store 1)
  {
    en: "Women's Silk Hijab",
    ar: "حجاب حريري نسائي",
    cat: "fashion-apparel",
    brand: "Generic",
    price: 15,
    store: 1,
    options: [{ name: "color", values: ["Black", "Navy", "Beige", "Rose"] }],
  },
  {
    en: "Men's Leather Belt",
    ar: "حزام جلدي رجالي",
    cat: "fashion-apparel",
    brand: "Generic",
    price: 19,
    store: 1,
    options: [{ name: "size", values: ["M", "L", "XL"] }],
  },
  {
    en: "Nike Running Shoes",
    ar: "حذاء نايكي للجري",
    cat: "fashion-apparel",
    brand: "Nike",
    price: 89,
    compareAt: 109,
    store: 1,
    options: [{ name: "size", values: ["40", "41", "42", "43"] }],
  },
  {
    en: "Women's Handbag",
    ar: "حقيبة يد نسائية",
    cat: "fashion-apparel",
    brand: "Generic",
    price: 39,
    store: 1,
    options: [{ name: "color", values: ["Black", "Brown"] }],
  },

  // Health & Beauty (store 1)
  {
    en: "Nivea Body Lotion 400ml",
    ar: "لوشن نيفيا للجسم 400 مل",
    cat: "health-beauty",
    brand: "Nivea",
    price: 8,
    store: 1,
  },
  {
    en: "Hair Dryer 2200W",
    ar: "مجفف شعر 2200 واط",
    cat: "health-beauty",
    brand: "Philips",
    price: 34,
    store: 1,
  },
  {
    en: "Vitamin C Serum 30ml",
    ar: "سيروم فيتامين سي 30 مل",
    cat: "health-beauty",
    brand: "Generic",
    price: 22,
    store: 1,
    status: "HIDDEN",
    moderationReason:
      "Unverified health claims in the description — pending documentation.",
  },
  {
    en: "Electric Beard Trimmer",
    ar: "ماكينة حلاقة كهربائية للحية",
    cat: "health-beauty",
    brand: "Philips",
    price: 42,
    compareAt: 55,
    store: 1,
  },

  // Groceries & Food (store 1)
  {
    en: "Premium Dates 1kg",
    ar: "تمر فاخر 1 كجم",
    cat: "groceries-food",
    brand: "Generic",
    price: 16,
    store: 1,
  },
  {
    en: "Green Cardamom 200g",
    ar: "هيل أخضر 200 جرام",
    cat: "groceries-food",
    brand: "Generic",
    price: 21,
    store: 1,
  },
  {
    en: "Mixed Nuts 500g",
    ar: "مكسرات مشكلة 500 جرام",
    cat: "groceries-food",
    brand: "Generic",
    price: 18,
    store: 1,
  },

  // Baby, Kids & Toys (store 1)
  {
    en: "Lego Classic Bricks Box",
    ar: "صندوق مكعبات ليغو كلاسيك",
    cat: "baby-kids-toys",
    brand: "Lego",
    price: 34,
    store: 1,
  },
  {
    en: "Foldable Baby Stroller",
    ar: "عربة أطفال قابلة للطي",
    cat: "baby-kids-toys",
    brand: "Generic",
    price: 89,
    compareAt: 119,
    store: 1,
  },
  {
    en: "Kids Educational Tablet",
    ar: "تابلت تعليمي للأطفال",
    cat: "baby-kids-toys",
    brand: "Generic",
    price: 45,
    store: 1,
  },

  // Books & Stationery (store 1)
  {
    en: "The Prophet by Kahlil Gibran",
    ar: "كتاب النبي لجبران خليل جبران",
    cat: "books-stationery",
    brand: "Generic",
    price: 12,
    store: 1,
  },
  {
    en: "A5 Notebook Pack of 3",
    ar: "دفتر A5 حزمة 3 قطع",
    cat: "books-stationery",
    brand: "Generic",
    price: 7,
    store: 1,
  },
  {
    en: "Luxury Fountain Pen",
    ar: "قلم حبر فاخر",
    cat: "books-stationery",
    brand: "Generic",
    price: 28,
    store: 1,
    status: "DRAFT",
  },
  {
    en: "Watercolor Paint Set 24 Colors",
    ar: "طقم ألوان مائية 24 لون",
    cat: "books-stationery",
    brand: "Generic",
    price: 16,
    store: 1,
  },
  {
    en: "Arabic-English Dictionary",
    ar: "قاموس عربي إنجليزي",
    cat: "books-stationery",
    brand: "Generic",
    price: 20,
    store: 1,
  },
];

type SeededVariant = { id: string; sku: string; price: number };
type SeededProduct = {
  id: string;
  slug: string;
  titleEn: string;
  storeId: string;
  variants: SeededVariant[];
};

async function main() {
  // Safety guard: this seed WIPES the database (clearDatabase) and inserts fake
  // test data. It must never run against production. Refuse unless explicitly
  // allowed via SEED_ALLOWED=true, and always refuse when NODE_ENV=production.
  if (
    process.env.NODE_ENV === "production" &&
    process.env.SEED_ALLOWED !== "true"
  ) {
    console.error(
      "❌ Refusing to seed: NODE_ENV=production. Set SEED_ALLOWED=true to override (destructive — clears all data).",
    );
    process.exit(1);
  }

  // Dev login password shared by every seeded user (see file header). Hashed
  // via the same helper the app uses so seeded users can sign in.
  const PASSWORD = await hashPassword("hezalli123");

  console.log("🧹 Clearing existing data…");
  await clearDatabase();

  // --- Platform settings + exchange rates (USD base) ---
  await prisma.platformSetting.createMany({
    data: [
      { key: "base_currency", value: "USD" },
      { key: "commission_rate", value: 0.1 },
      { key: "auto_complete_days", value: 7 },
      // Express delivery tier (Hezalli Express).
      { key: "express_enabled", value: true },
      { key: "default_express_fee", value: 10 },
      { key: "std_eta_min_days", value: 3 },
      { key: "std_eta_max_days", value: 7 },
      { key: "express_eta_min_days", value: 1 },
      { key: "express_eta_max_days", value: 2 },
      { key: "express_auto_assign", value: true },
      { key: "courier_assign_strategy", value: "balanced" },
    ],
  });
  await prisma.exchangeRate.createMany({
    data: [
      { currency: "YER", rate: 530 },
      { currency: "SAR", rate: 3.75 },
      { currency: "AED", rate: 3.67 },
    ],
  });

  // --- Categories ---
  const categoryBySlug = new Map<string, string>();
  for (let i = 0; i < CATEGORIES.length; i++) {
    const c = CATEGORIES[i];
    const created = await prisma.category.create({
      data: {
        name: { ar: c.ar, en: c.en },
        slug: c.slug,
        icon: c.icon,
        position: i,
      },
    });
    categoryBySlug.set(c.slug, created.id);
  }

  // --- Brands ---
  const brandByName = new Map<string, string>();
  for (const name of BRANDS) {
    const created = await prisma.brand.create({
      data: { name, slug: slugify(name) },
    });
    brandByName.set(name, created.id);
  }

  // --- Carriers ---
  const localCourier = await prisma.carrier.create({
    data: { name: "Local Courier", trackingUrl: null, platformManaged: false },
  });
  await prisma.carrier.create({
    data: {
      name: "Hezalli Express",
      trackingUrl: "https://www.hezalli.com/track/{tracking}",
      platformManaged: true,
    },
  });

  // --- Shipping zones ---
  const zoneCentral = await prisma.shippingZone.create({
    data: {
      name: "Sana'a & Central",
      governorates: ["Sana'a", "Amanat Al Asimah", "Dhamar", "Ibb"],
    },
  });
  const zoneSouth = await prisma.shippingZone.create({
    data: { name: "Aden & South", governorates: ["Aden", "Lahij", "Abyan"] },
  });

  // --- Admin ---
  const admin = await prisma.user.create({
    data: {
      name: "Hezalli Admin",
      email: "admin@hezalli.com",
      emailVerified: new Date(),
      phone: "+967700000001",
      phoneVerified: new Date(),
      passwordHash: PASSWORD,
      roles: ["ADMIN"],
      locale: "ar",
    },
  });

  // Staff managers: scoped money + delivery desks, so /wallet-manager and
  // /delivery-manager can be signed into and tested.
  await prisma.user.create({
    data: {
      name: "Wallet Manager",
      email: "wallet@hezalli.com",
      emailVerified: new Date(),
      phone: "+967700000011",
      phoneVerified: new Date(),
      passwordHash: PASSWORD,
      roles: ["WALLET_MANAGER"],
      locale: "ar",
    },
  });
  await prisma.user.create({
    data: {
      name: "Delivery Manager",
      email: "delivery@hezalli.com",
      emailVerified: new Date(),
      phone: "+967700000012",
      phoneVerified: new Date(),
      passwordHash: PASSWORD,
      roles: ["DELIVERY_MANAGER"],
      locale: "ar",
    },
  });

  // A Hezalli Express courier, so the dispatch board has someone to assign to
  // and the /driver app can be signed into.
  await prisma.user.create({
    data: {
      name: "Salah the Driver",
      email: "driver@hezalli.com",
      emailVerified: new Date(),
      phone: "+967700000009",
      phoneVerified: new Date(),
      passwordHash: PASSWORD,
      roles: ["COURIER"],
      locale: "ar",
    },
  });

  // A Hezalli Point partner (parcel hub operator), so the /point dashboard can
  // be signed into. Owns one ACTIVE DeliveryPoint — the guard requires that.
  await prisma.user.create({
    data: {
      name: "Sana'a Central Point",
      email: "point@hezalli.com",
      emailVerified: new Date(),
      phone: "+967700000010",
      phoneVerified: new Date(),
      passwordHash: PASSWORD,
      roles: ["DELIVERY_POINT"],
      locale: "ar",
      deliveryPoint: {
        create: {
          name: "Sana'a Central Point",
          phone: "+967700000010",
          governorate: "Sana'a",
          city: "Sana'a",
          addressLine: "Al-Zubairi Street, Building 5",
          status: "ACTIVE",
        },
      },
    },
  });

  // --- Sellers (+ profile + balance + store + shipping rates) ---
  async function createSeller(opts: {
    name: string;
    email: string;
    phone: string;
    storeName: string;
    storeSlug: string;
    kyc: "VERIFIED" | "PENDING";
  }) {
    const user = await prisma.user.create({
      data: {
        name: opts.name,
        email: opts.email,
        emailVerified: new Date(),
        phone: opts.phone,
        phoneVerified: new Date(),
        passwordHash: PASSWORD,
        roles: ["BUYER", "SELLER"],
        locale: "ar",
        sellerProfile: {
          create: {
            kycStatus: opts.kyc,
            balance: { create: {} },
          },
        },
      },
      include: { sellerProfile: { include: { balance: true } } },
    });
    const profile = user.sellerProfile!;
    const store = await prisma.store.create({
      data: {
        sellerId: profile.id,
        name: opts.storeName,
        slug: opts.storeSlug,
        description: `${opts.storeName} — a Hezalli store.`,
        status: "ACTIVE",
        shippingRates: {
          create: [
            {
              zoneId: zoneCentral.id,
              feeUsd: 3,
              freeOver: 50,
              expressFeeUsd: 8,
            },
            {
              zoneId: zoneSouth.id,
              feeUsd: 5,
              freeOver: 75,
              expressFeeUsd: 12,
            },
          ],
        },
      },
    });
    return { user, profile, balanceId: profile.balance!.id, storeId: store.id };
  }

  const seller1 = await createSeller({
    name: "Ahmed Al-Sanani",
    email: "seller1@hezalli.com",
    phone: "+967700000002",
    storeName: "Sana'a Electronics",
    storeSlug: "sanaa-electronics",
    kyc: "VERIFIED",
  });
  const seller2 = await createSeller({
    name: "Fatima Al-Adani",
    email: "seller2@hezalli.com",
    phone: "+967700000003",
    storeName: "Aden Fashion House",
    storeSlug: "aden-fashion-house",
    kyc: "PENDING",
  });
  const storeIds = [seller1.storeId, seller2.storeId];

  // --- Buyers (+ address) ---
  async function createBuyer(opts: {
    name: string;
    email: string;
    phone: string;
    governorate: string;
    city: string;
  }) {
    return prisma.user.create({
      data: {
        name: opts.name,
        email: opts.email,
        emailVerified: new Date(),
        phone: opts.phone,
        phoneVerified: new Date(),
        passwordHash: PASSWORD,
        roles: ["BUYER"],
        locale: "ar",
        addresses: {
          create: {
            type: "SHIPPING",
            fullName: opts.name,
            phone: opts.phone,
            governorate: opts.governorate,
            city: opts.city,
            line1: "Main Street, Building 10",
            isDefault: true,
          },
        },
      },
      include: { addresses: true },
    });
  }

  const buyer1 = await createBuyer({
    name: "Ali Hassan",
    email: "buyer1@example.com",
    phone: "+967711000001",
    governorate: "Sana'a",
    city: "Sana'a",
  });
  const buyer2 = await createBuyer({
    name: "Mona Saleh",
    email: "buyer2@example.com",
    phone: "+967711000002",
    governorate: "Aden",
    city: "Aden",
  });
  const buyer3 = await createBuyer({
    name: "Omar Nasser",
    email: "buyer3@example.com",
    phone: "+967711000003",
    governorate: "Taiz",
    city: "Taiz",
  });

  // Expand a product's option axes into concrete variants (Cartesian product).
  // No options → a single default variant, except legacy fashion items which
  // keep their S/L pair for backward compatibility.
  function buildVariants(p: SeedProductDef, slug: string) {
    const compareAtPrice = p.compareAt ?? null;
    const baseStock = p.stock ?? 40;

    if (p.options && p.options.length > 0) {
      let combos = [
        {
          label: [] as string[],
          attrs: {} as Record<string, string>,
          sku: [] as string[],
        },
      ];
      for (const axis of p.options) {
        combos = combos.flatMap((combo) =>
          axis.values.map((value) => ({
            label: [...combo.label, value],
            attrs: { ...combo.attrs, [axis.name]: value },
            sku: [...combo.sku, slugify(value)],
          })),
        );
      }
      // Higher storage tiers cost more, so variant selection changes the price.
      const STORAGE_PREMIUM: Record<string, number> = {
        "128GB": 0,
        "256GB": 30,
        "512GB": 60,
        "1TB": 120,
      };
      return combos.map((c, i) => {
        const premium = STORAGE_PREMIUM[c.attrs.storage] ?? 0;
        return {
          sku: `${slug}-${c.sku.join("-")}`,
          name: c.label.join(" / "),
          attributes: c.attrs,
          price: p.price + premium,
          compareAtPrice:
            compareAtPrice == null ? null : compareAtPrice + premium,
          // Vary stock a little so inventory reads as organic (min 2).
          stock: Math.max(2, baseStock - i * 4),
        };
      });
    }

    if (p.cat === "fashion-apparel") {
      return [
        {
          sku: `${slug}-s`,
          name: "Size S",
          attributes: { size: "S" },
          price: p.price,
          compareAtPrice,
          stock: 20,
        },
        {
          sku: `${slug}-l`,
          name: "Size L",
          attributes: { size: "L" },
          price: p.price,
          compareAtPrice,
          stock: 15,
        },
      ];
    }

    return [
      {
        sku: `${slug}-default`,
        name: "Default",
        attributes: {},
        price: p.price,
        compareAtPrice,
        stock: baseStock,
      },
    ];
  }

  // --- Products (+ variants + images) ---
  const products: SeededProduct[] = [];
  // Products the seed places in a HIDDEN (moderated) state, so we can also
  // seed the matching seller notification + audit-log entry afterwards.
  const moderatedSeed: {
    productId: string;
    storeIdx: number;
    reason: string;
  }[] = [];
  for (const p of PRODUCTS) {
    const slug = slugify(p.en);
    const status = p.status ?? "ACTIVE";
    const moderated = status === "HIDDEN";
    const reason = p.moderationReason ?? "";

    const created = await prisma.product.create({
      data: {
        storeId: storeIds[p.store],
        categoryId: categoryBySlug.get(p.cat)!,
        brandId: brandByName.get(p.brand)!,
        title: { ar: p.ar, en: p.en },
        slug,
        description: {
          ar: `${p.ar} — وصف تجريبي.`,
          en: `${p.en} — sample description.`,
        },
        condition: p.condition ?? "NEW",
        status,
        moderatedBy: moderated ? admin.id : null,
        moderationReason: moderated ? reason : null,
        basePrice: p.price,
        variants: { create: buildVariants(p, slug) },
        images: {
          create: [
            {
              url: `https://picsum.photos/seed/${slug}/600/600`,
              alt: p.en,
              position: 0,
            },
            {
              url: `https://picsum.photos/seed/${slug}-2/600/600`,
              alt: p.en,
              position: 1,
            },
          ],
        },
      },
      include: { variants: true },
    });
    if (moderated) {
      moderatedSeed.push({ productId: created.id, storeIdx: p.store, reason });
    }
    products.push({
      id: created.id,
      slug,
      titleEn: p.en,
      storeId: created.storeId,
      variants: created.variants.map((v) => ({
        id: v.id,
        sku: v.sku,
        price: Number(v.price),
      })),
    });
  }

  // Mirror the live moderation action (lib/actions/moderation.ts): each seeded
  // HIDDEN product gets the seller notification + audit-log entry an admin
  // hide would have produced. Seeded sellers are Arabic-locale.
  const sellerUserByStore = [seller1.user.id, seller2.user.id];
  for (const m of moderatedSeed) {
    await prisma.notification.create({
      data: {
        userId: sellerUserByStore[m.storeIdx],
        type: "SYSTEM",
        title: "تم إخفاء منتجك من قبل إدارة هزلي",
        body: `السبب: ${m.reason}. عدّل المنتج ليتوافق مع السياسات ثم تواصل معنا لإعادة نشره.`,
        data: { productId: m.productId, action: "hide" },
      },
    });
    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: "product.hide",
        entity: "Product",
        entityId: m.productId,
        meta: { reason: m.reason },
      },
    });
  }

  // --- Orders -------------------------------------------------------------
  const COMMISSION = 0.1;

  // Helper: build one single-seller order with items, payment, shipment.
  async function createOrder(opts: {
    buyerId: string;
    addressId: string;
    storeId: string;
    balanceId: string;
    paymentMethod: "COD" | "USDT" | "LOCAL_WALLET";
    orderStatus: "COMPLETED" | "PROCESSING" | "SHIPPED";
    subStatus: "COMPLETED" | "PROCESSING" | "SHIPPED";
    shipmentStatus: "DELIVERED" | "PENDING" | "IN_TRANSIT";
    lines: {
      variantId: string;
      sku: string;
      title: string;
      price: number;
      qty: number;
    }[];
    shippingUsd: number;
  }) {
    const itemsTotal = opts.lines.reduce((sum, l) => sum + l.price * l.qty, 0);
    const grandTotal = itemsTotal + opts.shippingUsd;
    const commissionAmt = Number((itemsTotal * COMMISSION).toFixed(2));
    const sellerNet = Number((itemsTotal - commissionAmt).toFixed(2));
    const completed = opts.subStatus === "COMPLETED";

    const paymentStatus =
      opts.paymentMethod === "COD" && completed
        ? "CONFIRMED"
        : opts.paymentMethod === "COD"
          ? "PENDING"
          : "CONFIRMED";

    const order = await prisma.order.create({
      data: {
        buyer: { connect: { id: opts.buyerId } },
        address: { connect: { id: opts.addressId } },
        status: opts.orderStatus,
        paymentMethod: opts.paymentMethod,
        itemsTotal,
        shippingTotal: opts.shippingUsd,
        grandTotal,
        displayCurrency: "USD",
        exchangeRate: 1,
        displayTotal: grandTotal,
        subOrders: {
          create: [
            {
              store: { connect: { id: opts.storeId } },
              status: opts.subStatus,
              itemsTotal,
              shippingTotal: opts.shippingUsd,
              commissionRate: COMMISSION,
              commissionAmt: completed ? commissionAmt : 0,
              sellerNet: completed ? sellerNet : 0,
              completedAt: completed ? new Date() : null,
              items: {
                create: opts.lines.map((l) => ({
                  variantId: l.variantId,
                  titleSnapshot: l.title,
                  skuSnapshot: l.sku,
                  unitPrice: l.price,
                  quantity: l.qty,
                  lineTotal: l.price * l.qty,
                })),
              },
              shipment: {
                create: {
                  status: opts.shipmentStatus,
                  carrierId: localCourier.id,
                  trackingNumber: `YE${Math.floor(100000 + opts.shippingUsd * 1000)}`,
                  platformManaged: false,
                  shippedAt:
                    opts.shipmentStatus === "PENDING" ? null : new Date(),
                  deliveredAt:
                    opts.shipmentStatus === "DELIVERED" ? new Date() : null,
                },
              },
            },
          ],
        },
        payment: {
          create: {
            method: opts.paymentMethod,
            status: paymentStatus,
            amountUsd: grandTotal,
            confirmedAt: paymentStatus === "CONFIRMED" ? new Date() : null,
            usdtNetwork: opts.paymentMethod === "USDT" ? "TRC20" : null,
            usdtTxHash:
              opts.paymentMethod === "USDT" ? "0xseedtxhash1234567890" : null,
            usdtAddress:
              opts.paymentMethod === "USDT"
                ? "TSeedUsdtAddr000000000000000000000"
                : null,
            reference:
              opts.paymentMethod === "LOCAL_WALLET" ? "JAWALI-REF-88213" : null,
          },
        },
        history: {
          create: [
            {
              status: opts.orderStatus,
              actor: "system",
              note: `Seed order (${opts.orderStatus})`,
            },
          ],
        },
      },
      include: { subOrders: true },
    });

    // Money movements
    if (completed && opts.paymentMethod === "COD") {
      // COD: seller already holds the cash → owes the 10% commission.
      await prisma.ledgerEntry.create({
        data: {
          balanceId: opts.balanceId,
          type: "COD_COMMISSION_DUE",
          amountUsd: -commissionAmt,
          subOrderId: order.subOrders[0].id,
          note: "COD commission owed to platform",
        },
      });
      await prisma.sellerBalance.update({
        where: { id: opts.balanceId },
        data: { availableUsd: { decrement: commissionAmt } },
      });
    } else if (!completed && opts.paymentMethod !== "COD") {
      // Prepaid, pre-completion: funds held in escrow (pending).
      await prisma.sellerBalance.update({
        where: { id: opts.balanceId },
        data: { pendingUsd: { increment: sellerNet } },
      });
    }

    return order;
  }

  // Order 1 — COD, completed (Sana'a Electronics)
  const order1 = await createOrder({
    buyerId: buyer1.id,
    addressId: buyer1.addresses[0].id,
    storeId: seller1.storeId,
    balanceId: seller1.balanceId,
    paymentMethod: "COD",
    orderStatus: "COMPLETED",
    subStatus: "COMPLETED",
    shipmentStatus: "DELIVERED",
    shippingUsd: 3,
    lines: [
      {
        variantId: products[2].variants[0].id,
        sku: products[2].variants[0].sku,
        title: products[2].titleEn,
        price: products[2].variants[0].price,
        qty: 1,
      },
      {
        variantId: products[4].variants[0].id,
        sku: products[4].variants[0].sku,
        title: products[4].titleEn,
        price: products[4].variants[0].price,
        qty: 1,
      },
    ],
  });

  // Order 2 — USDT, processing (Aden Fashion House)
  const order2 = await createOrder({
    buyerId: buyer2.id,
    addressId: buyer2.addresses[0].id,
    storeId: seller2.storeId,
    balanceId: seller2.balanceId,
    paymentMethod: "USDT",
    orderStatus: "PROCESSING",
    subStatus: "PROCESSING",
    shipmentStatus: "PENDING",
    shippingUsd: 5,
    lines: [
      {
        variantId: products[13].variants[0].id,
        sku: products[13].variants[0].sku,
        title: products[13].titleEn,
        price: products[13].variants[0].price,
        qty: 1,
      },
      {
        variantId: products[10].variants[0].id,
        sku: products[10].variants[0].sku,
        title: products[10].titleEn,
        price: products[10].variants[0].price,
        qty: 2,
      },
    ],
  });

  // Order 3 — wallet, shipped (Sana'a Electronics)
  const order3 = await createOrder({
    buyerId: buyer3.id,
    addressId: buyer3.addresses[0].id,
    storeId: seller1.storeId,
    balanceId: seller1.balanceId,
    paymentMethod: "LOCAL_WALLET",
    orderStatus: "SHIPPED",
    subStatus: "SHIPPED",
    shipmentStatus: "IN_TRANSIT",
    shippingUsd: 3,
    lines: [
      {
        variantId: products[6].variants[0].id,
        sku: products[6].variants[0].sku,
        title: products[6].titleEn,
        price: products[6].variants[0].price,
        qty: 1,
      },
      {
        variantId: products[7].variants[0].id,
        sku: products[7].variants[0].sku,
        title: products[7].titleEn,
        price: products[7].variants[0].price,
        qty: 1,
      },
    ],
  });

  // --- One review on the completed order ---
  const order1Full = await prisma.order.findUniqueOrThrow({
    where: { id: order1.id },
    include: { subOrders: true },
  });
  await prisma.review.create({
    data: {
      productId: products[4].id,
      subOrderId: order1Full.subOrders[0].id,
      buyerId: buyer1.id,
      rating: 5,
      comment: "منتج ممتاز وتوصيل سريع. Great product!",
    },
  });

  // =========================================================================
  // Extended mock data — broader test coverage.
  //
  // Everything below fills the feature areas the core seed left empty so every
  // screen in the app has something to render while building: carts &
  // wishlists, recently viewed, store follows, chat threads, a spread of
  // notifications, loyalty points + referrals, returns & a dispute, extra
  // coupons, an active flash sale, seller payout methods + a payout request,
  // and product view counts.
  // =========================================================================

  // --- Two more completed & delivered orders to hang returns/disputes on ----
  // Order 4 — COD, completed & delivered (Sana'a Electronics → buyer2)
  const order4 = await createOrder({
    buyerId: buyer2.id,
    addressId: buyer2.addresses[0].id,
    storeId: seller1.storeId,
    balanceId: seller1.balanceId,
    paymentMethod: "COD",
    orderStatus: "COMPLETED",
    subStatus: "COMPLETED",
    shipmentStatus: "DELIVERED",
    shippingUsd: 3,
    lines: [
      {
        variantId: products[9].variants[0].id,
        sku: products[9].variants[0].sku,
        title: products[9].titleEn,
        price: products[9].variants[0].price,
        qty: 2,
      },
    ],
  });

  // Order 5 — USDT, completed & delivered (Aden Fashion House → buyer3)
  const order5 = await createOrder({
    buyerId: buyer3.id,
    addressId: buyer3.addresses[0].id,
    storeId: seller2.storeId,
    balanceId: seller2.balanceId,
    paymentMethod: "USDT",
    orderStatus: "COMPLETED",
    subStatus: "COMPLETED",
    shipmentStatus: "DELIVERED",
    shippingUsd: 5,
    lines: [
      {
        variantId: products[14].variants[0].id,
        sku: products[14].variants[0].sku,
        title: products[14].titleEn,
        price: products[14].variants[0].price,
        qty: 1,
      },
    ],
  });

  // --- Return request (REQUESTED) on order 4 --------------------------------
  const sub4 = await prisma.subOrder.findFirstOrThrow({
    where: { orderId: order4.id },
    include: { items: true },
  });
  await prisma.returnRequest.create({
    data: {
      subOrderId: sub4.id,
      buyerId: buyer2.id,
      status: "REQUESTED",
      reason: "وصل المنتج بلون مختلف عن الصورة المعروضة.",
      items: { create: [{ orderItemId: sub4.items[0].id, quantity: 1 }] },
    },
  });

  // --- Return (APPROVED) + open dispute on order 5 --------------------------
  const sub5 = await prisma.subOrder.findFirstOrThrow({
    where: { orderId: order5.id },
    include: { items: true },
  });
  const return5 = await prisma.returnRequest.create({
    data: {
      subOrderId: sub5.id,
      buyerId: buyer3.id,
      status: "APPROVED",
      reason: "المقاس غير مطابق للوصف.",
      resolution: "بانتظار إرجاع المنتج إلى البائع.",
      items: { create: [{ orderItemId: sub5.items[0].id, quantity: 1 }] },
    },
  });
  const dispute5 = await prisma.dispute.create({
    data: {
      returnId: return5.id,
      status: "UNDER_REVIEW",
      openedBy: buyer3.id,
      assignedTo: admin.id,
      messages: {
        create: [
          {
            senderId: buyer3.id,
            body: "البائع لم يرد على طلب الإرجاع، أرجو المساعدة.",
          },
          {
            senderId: admin.id,
            body: "شكراً لتواصلك، نقوم بمراجعة الطلب الآن.",
          },
        ],
      },
    },
  });

  // --- Carts (active items + one saved-for-later) ---------------------------
  const cart2 = await prisma.cart.create({ data: { userId: buyer2.id } });
  await prisma.cartItem.createMany({
    data: [
      {
        cartId: cart2.id,
        variantId: products[0].variants[0].id,
        storeId: products[0].storeId,
        quantity: 1,
      },
      {
        cartId: cart2.id,
        variantId: products[5].variants[0].id,
        storeId: products[5].storeId,
        quantity: 2,
      },
      {
        cartId: cart2.id,
        variantId: products[21].variants[0].id,
        storeId: products[21].storeId,
        quantity: 1,
        savedForLater: true,
      },
    ],
  });
  const cart3 = await prisma.cart.create({ data: { userId: buyer3.id } });
  await prisma.cartItem.create({
    data: {
      cartId: cart3.id,
      variantId: products[1].variants[0].id,
      storeId: products[1].storeId,
      quantity: 1,
    },
  });

  // --- Wishlists ------------------------------------------------------------
  const wl1 = await prisma.wishlist.create({ data: { userId: buyer1.id } });
  await prisma.wishlistItem.createMany({
    data: [
      { wishlistId: wl1.id, productId: products[0].id },
      { wishlistId: wl1.id, productId: products[20].id },
      { wishlistId: wl1.id, productId: products[28].id },
    ],
  });
  const wl2 = await prisma.wishlist.create({ data: { userId: buyer2.id } });
  await prisma.wishlistItem.createMany({
    data: [
      { wishlistId: wl2.id, productId: products[41].id },
      { wishlistId: wl2.id, productId: products[13].id },
    ],
  });

  // --- Recently viewed ------------------------------------------------------
  await prisma.recentlyViewed.createMany({
    data: [
      { userId: buyer1.id, productId: products[1].id },
      { userId: buyer1.id, productId: products[3].id },
      { userId: buyer1.id, productId: products[20].id },
      { userId: buyer2.id, productId: products[42].id },
      { userId: buyer3.id, productId: products[6].id },
    ],
  });

  // --- Store follows --------------------------------------------------------
  await prisma.storeFollow.createMany({
    data: [
      { userId: buyer1.id, storeId: seller1.storeId },
      { userId: buyer2.id, storeId: seller1.storeId },
      { userId: buyer2.id, storeId: seller2.storeId },
      { userId: buyer3.id, storeId: seller2.storeId },
    ],
  });

  // --- Chat threads (buyer ↔ store) -----------------------------------------
  const conv1 = await prisma.conversation.create({
    data: {
      buyerId: buyer1.id,
      storeId: seller1.storeId,
      subOrderId: order1Full.subOrders[0].id,
    },
  });
  await prisma.message.createMany({
    data: [
      {
        conversationId: conv1.id,
        senderId: buyer1.id,
        body: "هل المنتج متوفر بلون آخر؟",
        readAt: new Date(),
      },
      {
        conversationId: conv1.id,
        senderId: seller1.user.id,
        body: "نعم، متوفر بالأسود والفضي.",
        readAt: new Date(),
      },
      {
        conversationId: conv1.id,
        senderId: buyer1.id,
        body: "ممتاز، شكراً لك!",
      },
    ],
  });
  const conv2 = await prisma.conversation.create({
    data: { buyerId: buyer2.id, storeId: seller2.storeId },
  });
  await prisma.message.create({
    data: {
      conversationId: conv2.id,
      senderId: buyer2.id,
      body: "متى يصل الطلب إلى عدن؟",
    },
  });

  // --- Notifications (a spread of types per user) ---------------------------
  await prisma.notification.createMany({
    data: [
      {
        userId: buyer1.id,
        type: "ORDER",
        title: "تم تأكيد طلبك",
        body: "طلبك قيد التجهيز الآن.",
        data: { orderId: order1.id },
        readAt: new Date(),
      },
      {
        userId: buyer1.id,
        type: "SHIPMENT",
        title: "تم شحن طلبك",
        body: "الطلب في الطريق إليك.",
        data: { orderId: order3.id },
      },
      {
        userId: buyer1.id,
        type: "PROMO",
        title: "خصم 10% بكود WELCOME10",
        body: "استخدم الكود عند الدفع.",
      },
      {
        userId: buyer2.id,
        type: "RETURN",
        title: "تم استلام طلب الإرجاع",
        body: "سيتم مراجعة طلبك خلال 48 ساعة.",
        data: { orderId: order4.id },
      },
      {
        userId: buyer3.id,
        type: "DISPUTE",
        title: "تم فتح نزاع",
        body: "فريق الدعم يراجع حالتك.",
        data: { disputeId: dispute5.id },
      },
      {
        userId: seller1.user.id,
        type: "ORDER",
        title: "طلب جديد",
        body: "لديك طلب جديد بانتظار التجهيز.",
        data: { orderId: order1.id },
      },
      {
        userId: seller2.user.id,
        type: "ORDER",
        title: "طلب جديد",
        body: "لديك طلب جديد بانتظار التجهيز.",
        data: { orderId: order2.id },
      },
    ],
  });

  // --- Loyalty points + referral graph --------------------------------------
  // buyer1 earned points on order 1 and referred buyer3.
  await prisma.user.update({
    where: { id: buyer1.id },
    data: { referralCode: "HZALI0001", loyaltyPoints: 264 },
  });
  await prisma.user.update({
    where: { id: buyer2.id },
    data: { referralCode: "HZMONA002", loyaltyPoints: 40 },
  });
  await prisma.user.update({
    where: { id: buyer3.id },
    data: {
      referralCode: "HZOMAR003",
      referredById: buyer1.id,
      // Promotions email opt-out, to exercise notification preferences.
      notificationPrefs: {
        orders: true,
        shipping: true,
        payments: true,
        returns: true,
        chat: true,
        promotions: false,
      },
    },
  });
  await prisma.loyaltyTransaction.createMany({
    data: [
      {
        userId: buyer1.id,
        points: 64,
        type: "EARN",
        orderId: order1.id,
        note: "نقاط شراء الطلب",
      },
      {
        userId: buyer1.id,
        points: 200,
        type: "REFERRAL",
        note: "مكافأة دعوة صديق",
      },
      {
        userId: buyer2.id,
        points: 40,
        type: "EARN",
        orderId: order2.id,
        note: "نقاط شراء الطلب",
      },
    ],
  });

  // --- Extra coupons (seller-scoped, fixed, free-shipping, expired) ---------
  await prisma.coupon.createMany({
    data: [
      {
        code: "SANAA5",
        scope: "SELLER",
        storeId: seller1.storeId,
        discountType: "FIXED",
        value: 5,
        minSpendUsd: 30,
        maxUses: 200,
        perUserLimit: 1,
        isActive: true,
      },
      {
        code: "FREESHIP",
        scope: "PLATFORM",
        discountType: "FREE_SHIPPING",
        value: 0,
        minSpendUsd: 40,
        maxUses: 500,
        isActive: true,
      },
      {
        code: "EID25",
        scope: "PLATFORM",
        discountType: "PERCENT",
        value: 25,
        maxDiscountUsd: 20,
        minSpendUsd: 50,
        maxUses: 100,
        isActive: false,
        endsAt: new Date("2026-01-01"),
      },
    ],
  });

  // --- Active flash sale ----------------------------------------------------
  const flashNow = new Date();
  await prisma.flashSale.create({
    data: {
      name: { ar: "عروض اليوم", en: "Deals of the Day" },
      startsAt: new Date(flashNow.getTime() - 60 * 60 * 1000),
      endsAt: new Date(flashNow.getTime() + 6 * 60 * 60 * 1000),
      isActive: true,
      items: {
        create: [
          {
            variantId: products[3].variants[0].id,
            salePrice:
              Math.round(products[3].variants[0].price * 0.8 * 100) / 100,
            stockLimit: 20,
            soldCount: 5,
          },
          {
            variantId: products[28].variants[0].id,
            salePrice:
              Math.round(products[28].variants[0].price * 0.85 * 100) / 100,
            stockLimit: 15,
            soldCount: 3,
          },
        ],
      },
    },
  });

  // --- Seller payout methods, ledger, balance, and a payout request ---------
  await prisma.payoutMethod.create({
    data: {
      sellerId: seller1.profile.id,
      kind: "bank",
      isDefault: true,
      details: {
        bankName: "بنك التضامن الإسلامي",
        accountName: "Ahmed Al-Sanani",
        accountNumber: "1234567890",
      },
    },
  });
  await prisma.payoutMethod.create({
    data: {
      sellerId: seller2.profile.id,
      kind: "wallet",
      isDefault: true,
      details: {
        provider: "Jawali",
        accountName: "Fatima Al-Adani",
        walletNumber: "770123456",
      },
    },
  });
  // Give seller1 some settled earnings so the payout flow has funds to draw on.
  await prisma.ledgerEntry.createMany({
    data: [
      {
        balanceId: seller1.balanceId,
        type: "SALE",
        amountUsd: 88,
        note: "Settled sale (seed)",
      },
      {
        balanceId: seller1.balanceId,
        type: "COMMISSION",
        amountUsd: -8.8,
        note: "Platform commission (seed)",
      },
    ],
  });
  await prisma.sellerBalance.update({
    where: { id: seller1.balanceId },
    data: { availableUsd: { increment: 79.2 } },
  });
  await prisma.payout.create({
    data: {
      sellerId: seller1.profile.id,
      amountUsd: 50,
      method: "bank",
      destination: {
        bankName: "بنك التضامن الإسلامي",
        accountNumber: "1234567890",
      },
      status: "REQUESTED",
    },
  });

  // --- Product view counts (organic-looking popularity) ---------------------
  for (let i = 0; i < products.length; i++) {
    await prisma.product.update({
      where: { id: products[i].id },
      data: { views: ((i * 37 + 11) % 900) + 20 },
    });
  }

  // --- CMS pages, banner, coupon (light extras for later phases) ---
  // Real draft legal/content pages (About, Terms, Privacy, Returns, FAQ,
  // Contact) — see lib/cms-content.ts. Admins can edit them at /admin/pages.
  await prisma.cmsPage.createMany({
    data: CMS_SEEDS.map((p) => ({
      slug: p.slug,
      title: p.title,
      body: p.body,
      published: true,
    })),
  });
  await prisma.banner.create({
    data: {
      image: "https://picsum.photos/seed/hezalli-hero/1200/400",
      title: { ar: "مرحباً بك في هزلي", en: "Welcome to Hezalli" },
      position: "home_hero",
      isActive: true,
      sortOrder: 0,
    },
  });
  await prisma.banner.createMany({
    data: [
      {
        image: "https://picsum.photos/seed/hezalli-electronics/1200/400",
        title: { ar: "تخفيضات الإلكترونيات", en: "Electronics Sale" },
        linkUrl: "/c/electronics",
        position: "home_hero",
        isActive: true,
        sortOrder: 1,
      },
      {
        image: "https://picsum.photos/seed/hezalli-strip/1200/200",
        title: {
          ar: "شحن مجاني للطلبات فوق 40$",
          en: "Free shipping over $40",
        },
        position: "home_strip",
        isActive: true,
        sortOrder: 0,
      },
    ],
  });
  await prisma.coupon.create({
    data: {
      code: "WELCOME10",
      scope: "PLATFORM",
      discountType: "PERCENT",
      value: 10,
      minSpendUsd: 20,
      maxUses: 1000,
      isActive: true,
    },
  });

  // --- Summary ---
  const counts = {
    users: await prisma.user.count(),
    sellers: await prisma.sellerProfile.count(),
    stores: await prisma.store.count(),
    categories: await prisma.category.count(),
    products: await prisma.product.count(),
    variants: await prisma.productVariant.count(),
    images: await prisma.productImage.count(),
    orders: await prisma.order.count(),
    subOrders: await prisma.subOrder.count(),
    payments: await prisma.payment.count(),
    reviews: await prisma.review.count(),
    cartItems: await prisma.cartItem.count(),
    wishlistItems: await prisma.wishlistItem.count(),
    storeFollows: await prisma.storeFollow.count(),
    conversations: await prisma.conversation.count(),
    messages: await prisma.message.count(),
    notifications: await prisma.notification.count(),
    returns: await prisma.returnRequest.count(),
    disputes: await prisma.dispute.count(),
    coupons: await prisma.coupon.count(),
    flashSales: await prisma.flashSale.count(),
    loyaltyTxns: await prisma.loyaltyTransaction.count(),
    payouts: await prisma.payout.count(),
    banners: await prisma.banner.count(),
  };
  console.log("✅ Seed complete:", counts);
}

main()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error("❌ Seed failed:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
