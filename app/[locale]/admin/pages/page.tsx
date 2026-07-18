import { prisma } from "@/lib/prisma";
import { CmsManager, type CmsPageRow } from "@/components/admin/cms-manager";

export const dynamic = "force-dynamic";

type Localized = { en?: string; ar?: string };

export default async function AdminPagesPage() {
  const pages = await prisma.cmsPage.findMany({ orderBy: { slug: "asc" } });
  const rows: CmsPageRow[] = pages.map((p) => {
    const title = (p.title ?? {}) as Localized;
    const body = (p.body ?? {}) as Localized;
    return {
      slug: p.slug,
      titleEn: title.en ?? "",
      titleAr: title.ar ?? "",
      bodyEn: body.en ?? "",
      bodyAr: body.ar ?? "",
      published: p.published,
    };
  });

  return <CmsManager pages={rows} />;
}
