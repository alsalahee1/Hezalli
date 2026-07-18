import { prisma } from "@/lib/prisma";
import {
  BannerManager,
  type BannerRow,
} from "@/components/admin/banner-manager";

function toDateInput(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

export default async function AdminBannersPage() {
  const banners = await prisma.banner.findMany({ orderBy: { id: "asc" } });
  const rows: BannerRow[] = banners.map((b) => {
    const title = (b.title ?? {}) as { en?: string; ar?: string };
    return {
      id: b.id,
      image: b.image,
      titleEn: title.en ?? "",
      titleAr: title.ar ?? "",
      linkUrl: b.linkUrl ?? "",
      position: b.position,
      isActive: b.isActive,
      startsAt: toDateInput(b.startsAt),
      endsAt: toDateInput(b.endsAt),
    };
  });

  return <BannerManager banners={rows} />;
}
