import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { auth } from "@/auth";
import { Link, redirect } from "@/i18n/navigation";
import { LoginForm } from "@/components/auth/login-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Auth");
  return { title: t("loginTitle") };
}

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (session?.user) redirect({ href: "/", locale });

  const t = await getTranslations("Auth");
  const { callbackUrl } = await searchParams;

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("loginTitle")}
        </h1>
        <p className="text-muted-foreground text-sm">{t("loginSubtitle")}</p>
      </div>

      <LoginForm callbackUrl={callbackUrl} />

      <p className="text-muted-foreground text-center text-sm">
        {t("noAccount")}{" "}
        <Link
          href="/register"
          className="text-foreground font-medium hover:underline"
        >
          {t("createOne")}
        </Link>
      </p>
    </div>
  );
}
