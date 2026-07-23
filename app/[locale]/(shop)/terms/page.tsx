import { redirect } from "@/i18n/navigation";

// The real, bilingual Terms of Service lives in the CMS (`/p/terms`,
// admin-editable). This route only catches legacy/external links.
export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: "/p/terms", locale });
}
