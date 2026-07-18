import { setRequestLocale } from "next-intl/server";

import { ComingSoon } from "@/components/coming-soon";

// Placeholder — the real request/reset flow is built in Step 3.2 (Resend).
export default async function ForgotPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ComingSoon ns="Auth" titleKey="forgotPassword" />;
}
