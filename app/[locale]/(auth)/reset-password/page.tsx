import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Auth");
  return { title: t("resetPasswordTitle") };
}

export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { token } = await searchParams;
  const t = await getTranslations("Auth");

  // No token in the link at all — nothing to verify, so point them back to
  // request a fresh one rather than showing an unusable form.
  if (!token) {
    return (
      <div className="space-y-6 text-center">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("resetPasswordTitle")}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t("resetLinkInvalid")}
          </p>
        </div>
        <Link
          href="/forgot-password"
          className="text-foreground text-sm font-medium hover:underline"
        >
          {t("sendResetLink")}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("resetPasswordTitle")}
        </h1>
        <p className="text-muted-foreground text-sm">
          {t("resetPasswordSubtitle")}
        </p>
      </div>

      <ResetPasswordForm token={token} />
    </div>
  );
}
