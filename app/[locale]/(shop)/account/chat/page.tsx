import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import { getOrCreateConversation } from "@/lib/actions/chat";
import { ChatApp } from "@/components/chat/chat-app";

export default async function BuyerChatPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; store?: string }>;
}) {
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user?.id) {
    redirect(`/${locale}/login?callbackUrl=/${locale}/account/chat`);
  }
  const t = await getTranslations("Chat");
  const { c, store } = await searchParams;

  let initialId = c;
  if (!initialId && store) {
    const res = await getOrCreateConversation(store);
    initialId = res.conversationId;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <ChatApp initialConversationId={initialId} />
    </div>
  );
}
