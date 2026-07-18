import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";

import { prisma } from "@/lib/prisma";

type Localized = { en?: string; ar?: string };

async function loadPage(slug: string) {
  const page = await prisma.cmsPage.findUnique({
    where: { slug },
    select: { title: true, body: true, published: true, updatedAt: true },
  });
  if (!page || !page.published) return null;
  return page;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await loadPage(slug);
  if (!page) return {};
  const locale = await getLocale();
  const title = (page.title as Localized)[locale as "en" | "ar"];
  return { title: title ?? (page.title as Localized).en };
}

export default async function CmsPageView({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = await loadPage(slug);
  if (!page) notFound();
  const locale = (await getLocale()) as "en" | "ar";

  const title =
    (page.title as Localized)[locale] ?? (page.title as Localized).en ?? "";
  const body =
    (page.body as Localized)[locale] ?? (page.body as Localized).en ?? "";

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <div
        className="mt-6 text-[15px] [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:mt-1 [&_p]:mt-3 [&_p]:leading-7 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:ps-6"
        // Body is authored only by admins in the CMS editor (trusted content).
        dangerouslySetInnerHTML={{ __html: body }}
      />
    </main>
  );
}
