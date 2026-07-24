import { getLocale, getTranslations } from "next-intl/server";

import { BOT_IDS, botName, isBotId } from "@/lib/ai/bot-constants";
import { prisma } from "@/lib/prisma";
import { FaqManager, type FaqRow } from "@/components/admin/faq-manager";

export const dynamic = "force-dynamic";

// Manage the assistant's curated knowledge base. Opening with ?q=…&bot=… (from
// a "needs attention" stat) pre-fills a new entry.
export default async function AdminFaqPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; bot?: string }>;
}) {
  const t = await getTranslations("AdminFaq");
  const locale = await getLocale();
  const sp = await searchParams;

  let faqs: FaqRow[] = [];
  try {
    faqs = await prisma.aiFaq.findMany({
      orderBy: [{ enabled: "desc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        question: true,
        answer: true,
        bot: true,
        locale: true,
        enabled: true,
        hitCount: true,
      },
    });
  } catch {
    faqs = []; // table not created yet (pre-migration)
  }

  const botNames = Object.fromEntries(
    BOT_IDS.map((id) => [id, botName(id, locale)]),
  );
  const initialDraft = sp.q
    ? {
        question: sp.q.slice(0, 400),
        bot: isBotId(sp.bot) ? sp.bot : "all",
      }
    : undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("desc")}</p>
      </div>
      <FaqManager faqs={faqs} botNames={botNames} initialDraft={initialDraft} />
    </div>
  );
}
