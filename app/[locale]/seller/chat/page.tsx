import { getTranslations } from "next-intl/server";

import { requireSellerStore } from "@/lib/authz";
import { ChatApp } from "@/components/chat/chat-app";

export default async function SellerChatPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const gate = await requireSellerStore();
  if (!gate) return null;
  const t = await getTranslations("Chat");
  const { c } = await searchParams;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <ChatApp initialConversationId={c} />
    </div>
  );
}
