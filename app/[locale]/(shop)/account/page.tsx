import { getLocale } from "next-intl/server";

import { auth } from "@/auth";
import { redirect } from "@/i18n/navigation";
import { ComingSoon } from "@/components/coming-soon";

export default async function AccountPage() {
  const session = await auth();
  const locale = await getLocale();

  // The full account area (profile, addresses, security) arrives in Step 3.4;
  // for now the page only requires the user to be signed in.
  if (!session?.user) redirect({ href: "/login", locale });

  return <ComingSoon ns="Header" titleKey="account" />;
}
