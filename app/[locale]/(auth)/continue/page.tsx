import { setRequestLocale } from "next-intl/server";

import { auth } from "@/auth";
import { redirect } from "@/i18n/navigation";

// Post-login landing resolver for biometric sign-in. The passkey provider can't
// compute a role-aware destination while issuing the session (it would have to
// verify the assertion twice), so it redirects here — on this next request the
// session cookie is set, and we forward each role to its home, mirroring the
// password flow's landing logic in `authenticate`.
export default async function ContinuePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user?.id) redirect({ href: "/login", locale });

  const roles = session?.user?.roles ?? [];
  const href = roles.includes("ADMIN")
    ? "/admin"
    : roles.includes("WALLET_MANAGER")
      ? "/wallet-manager"
      : roles.includes("DELIVERY_MANAGER")
        ? "/delivery-manager"
        : roles.includes("SELLER")
          ? "/seller"
          : roles.includes("COURIER")
            ? "/driver"
            : roles.includes("DELIVERY_POINT")
              ? "/point"
              : "/";

  redirect({ href, locale });
}
