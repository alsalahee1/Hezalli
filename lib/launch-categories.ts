// The launch product taxonomy (from docs/DECISIONS.md). These are structural
// storefront categories, not sample data, so they are kept in one place and
// upserted on every deploy (see prisma/ensure-categories.ts) as well as used
// by the full seed (prisma/seed.ts).
export type LaunchCategory = {
  en: string;
  ar: string;
  slug: string;
  icon: string;
};

export const LAUNCH_CATEGORIES: LaunchCategory[] = [
  { en: "Electronics", ar: "إلكترونيات", slug: "electronics", icon: "💻" },
  {
    en: "Phones & Accessories",
    ar: "الهواتف والإكسسوارات",
    slug: "phones-accessories",
    icon: "📱",
  },
  {
    en: "Fashion & Apparel",
    ar: "الأزياء والملابس",
    slug: "fashion-apparel",
    icon: "👗",
  },
  {
    en: "Home & Kitchen",
    ar: "المنزل والمطبخ",
    slug: "home-kitchen",
    icon: "🏠",
  },
  {
    en: "Health & Beauty",
    ar: "الصحة والجمال",
    slug: "health-beauty",
    icon: "💄",
  },
  {
    en: "Groceries & Food",
    ar: "البقالة والأغذية",
    slug: "groceries-food",
    icon: "🛒",
  },
  {
    en: "Baby, Kids & Toys",
    ar: "الأطفال والألعاب",
    slug: "baby-kids-toys",
    icon: "🧸",
  },
  {
    en: "Books & Stationery",
    ar: "الكتب والقرطاسية",
    slug: "books-stationery",
    icon: "📚",
  },
  {
    en: "Sports & Outdoors",
    ar: "الرياضة والهواء الطلق",
    slug: "sports-outdoors",
    icon: "⚽",
  },
  {
    en: "Automotive & Tools",
    ar: "السيارات والأدوات",
    slug: "automotive-tools",
    icon: "🚗",
  },
];
