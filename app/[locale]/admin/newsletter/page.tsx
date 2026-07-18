import { getTranslations } from "next-intl/server";

import { prisma } from "@/lib/prisma";
import { NewsletterComposer } from "@/components/admin/newsletter-composer";

export const dynamic = "force-dynamic";

export default async function AdminNewsletterPage() {
  const t = await getTranslations("AdminNewsletter");
  const [total, active] = await Promise.all([
    prisma.newsletterSubscriber.count(),
    prisma.newsletterSubscriber.count({ where: { unsubscribedAt: null } }),
  ]);

  const cards = [
    { label: t("active"), value: active },
    { label: t("total"), value: total },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("desc")}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:max-w-md">
        {cards.map((c) => (
          <div key={c.label} className="bg-card rounded-lg border p-4">
            <p className="text-muted-foreground text-sm">{c.label}</p>
            <p className="mt-1 text-xl font-semibold">{c.value}</p>
          </div>
        ))}
      </div>

      <NewsletterComposer activeCount={active} />
    </div>
  );
}
