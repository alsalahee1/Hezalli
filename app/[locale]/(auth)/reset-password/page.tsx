import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Auth");
  return { title: t("resetTitle") };
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
  const t = await getTranslations("Auth");
  const { token } = await searchParams;

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("resetTitle")}
        </h1>
        <p className="text-muted-foreground text-sm">{t("resetSubtitle")}</p>
      </div>
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className="space-y-4 text-center">
          <p className="bg-destructive/10 text-destructive rounded-md px-3 py-3 text-sm">
            {t("resetLinkInvalid")}
          </p>
          <Link
            href="/forgot-password"
            className="text-foreground text-sm font-medium hover:underline"
          >
            {t("resetRequestAgain")}
          </Link>
        </div>
      )}
    </div>
  );
}
