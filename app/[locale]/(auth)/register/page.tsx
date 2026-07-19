import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Link, redirect } from "@/i18n/navigation";
import { RegisterForm } from "@/components/auth/register-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Auth");
  return { title: t("registerTitle") };
}

export default async function RegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ ref?: string }>;
}) {
  const { locale } = await params;
  const { ref } = await searchParams;
  setRequestLocale(locale);

  // Same guard as the login page: a stale JWT (deleted user / reseeded DB) must
  // not trap the user by bouncing them home. Only redirect a user who still
  // exists in the database.
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

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("registerTitle")}
        </h1>
        <p className="text-muted-foreground text-sm">{t("registerSubtitle")}</p>
      </div>

      <RegisterForm refCode={ref} />

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
