import { redirect } from "@/i18n/navigation";

// The real, bilingual About page lives in the CMS (`/p/about`,
// admin-editable). This route only catches legacy/external links.
export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: "/p/about", locale });
}
