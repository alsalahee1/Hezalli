// The assistant's curated knowledge base. Enabled entries matching the active
// character + language are formatted into a prompt block each turn, so the bot
// answers known questions consistently instead of falling back.
import "server-only";

import { prisma } from "@/lib/prisma";

import type { BotId } from "./bot-constants";

// Keep the injected block bounded so the prompt stays lean; newest first.
const MAX_INJECTED = 40;

/**
 * A prompt block of curated answers for this character + language, or "" if
 * none. Never throws (missing table during rollout, DB hiccup → no block).
 */
export async function getFaqBlock(bot: BotId, locale: string): Promise<string> {
  let rows: Array<{ question: string; answer: string }> = [];
  try {
    rows = await prisma.aiFaq.findMany({
      where: {
        enabled: true,
        bot: { in: ["all", bot] },
        locale: { in: ["all", locale] },
      },
      orderBy: { updatedAt: "desc" },
      take: MAX_INJECTED,
      select: { question: true, answer: true },
    });
  } catch {
    return "";
  }
  if (rows.length === 0) return "";

  const items = rows
    .map((r) => `Q: ${r.question.trim()}\nA: ${r.answer.trim()}`)
    .join("\n\n");
  return [
    "Known answers (the store's own knowledge base). When the user's question",
    "matches one of these, base your reply on the given answer — rephrase it in",
    "your own voice, keep it accurate, and don't contradict it. If none matches,",
    "answer normally.",
    "",
    items,
  ].join("\n");
}
