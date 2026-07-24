import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Link, redirect } from "@/i18n/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { PasskeyLoginButton } from "@/components/auth/passkey-login-button";
import { DevQuickLogin } from "@/components/auth/dev-quick-login";

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

  // Only redirect a real, still-existing user away from the login page. A stale
  // JWT (account deleted or DB reseeded while the browser kept its cookie) still
  // looks authenticated and would otherwise trap the user: login bounces home,
  // but the deleted account is unusable. Treat a missing user as logged-out so
  // they can sign in fresh.
  const session = await auth();
  const sessionUserId = session?.user?.id;
  const userExists =
    !!sessionUserId &&
    !!(await prisma.user.findUnique({
      where: { id: sessionUserId },
      select: { id: true },
    }));
  if (userExists) redirect({ href: "/", locale });

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

      <PasskeyLoginButton callbackUrl={callbackUrl} />

      <DevQuickLogin />

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
