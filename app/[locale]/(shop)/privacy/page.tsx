import { redirect } from "@/i18n/navigation";

// The real, bilingual Privacy Policy lives in the CMS (`/p/privacy`,
// admin-editable). This route only catches legacy/external links.
export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: "/p/privacy", locale });
}
