import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { auth } from "@/auth";
import { Link, redirect } from "@/i18n/navigation";
import { RegisterForm } from "@/components/auth/register-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Auth");
  return { title: t("registerTitle") };
}

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (session?.user) redirect({ href: "/", locale });

  const t = await getTranslations("Auth");

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("registerTitle")}
        </h1>
        <p className="text-muted-foreground text-sm">{t("registerSubtitle")}</p>
      </div>

      <RegisterForm />

      <p className="text-muted-foreground text-center text-sm">
        {t("haveAccount")}{" "}
        <Link
          href="/login"
          className="text-foreground font-medium hover:underline"
        >
          {t("signInLink")}
        </Link>
      </p>
    </div>
  );
}
