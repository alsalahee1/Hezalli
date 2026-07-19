import { getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import { linkedPlatforms } from "@/lib/ai/account-link";
import { LinkTelegram } from "@/components/account/link-telegram";

// The account layout already enforces auth; we still read the session to show
// the current link status.
export default async function LinkTelegramPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const [session, sp, t] = await Promise.all([
    auth(),
    searchParams,
    getTranslations("BotLink"),
  ]);

  const linked = session?.user?.id
    ? (await linkedPlatforms(session.user.id)).includes("telegram")
    : false;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </div>
      <LinkTelegram code={sp.code} linked={linked} />
    </div>
  );
}
