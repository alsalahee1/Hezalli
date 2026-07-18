/**
 * Idempotent category upsert — runs on every deploy (from the compose
 * `migrate` service) after migrations.
 *
 * Unlike prisma/seed.ts this is NON-destructive: it upserts the launch
 * taxonomy by slug, so the storefront's "Shop by category" section is always
 * populated even when the full (destructive) seed was skipped because the
 * database already held data. Existing products, orders, and users are left
 * untouched; re-running it only refreshes each category's name/icon/position.
 */
import "dotenv/config";

import { LAUNCH_CATEGORIES } from "../lib/launch-categories";
import { prisma } from "../lib/prisma";

async function main() {
  let created = 0;
  let updated = 0;

  for (let i = 0; i < LAUNCH_CATEGORIES.length; i++) {
    const c = LAUNCH_CATEGORIES[i];
    const existing = await prisma.category.findUnique({
      where: { slug: c.slug },
      select: { id: true },
    });
    await prisma.category.upsert({
      where: { slug: c.slug },
      create: {
        name: { ar: c.ar, en: c.en },
        slug: c.slug,
        icon: c.icon,
        position: i,
        parentId: null,
        isActive: true,
      },
      // Refresh presentation fields but do NOT force isActive — respect an
      // admin who has intentionally deactivated a category.
      update: {
        name: { ar: c.ar, en: c.en },
        icon: c.icon,
        position: i,
      },
    });
    existing ? updated++ : created++;
  }

  console.log(
    `Categories ensured — ${created} created, ${updated} updated (${LAUNCH_CATEGORIES.length} total).`,
  );
}

main()
  .catch((error) => {
    console.error("ensure-categories failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
