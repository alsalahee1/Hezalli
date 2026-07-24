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

// Normalise a question to a set of meaningful word tokens (drop punctuation and
// very short words) for lightweight overlap matching.
function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3),
  );
}

/**
 * Attribute a shopper's question to the best-matching enabled FAQ (if any) and
 * bump its usefulness counter. Best-effort, fire-and-forget: we don't know
 * which entry the model actually used, so we approximate with keyword overlap
 * (share of the FAQ's words present in the question). Conservative threshold to
 * avoid over-counting.
 */
export async function recordFaqHit(
  bot: BotId,
  locale: string,
  question: string,
): Promise<void> {
  const asked = tokenize(question);
  if (asked.size === 0) return;
  try {
    const rows = await prisma.aiFaq.findMany({
      where: {
        enabled: true,
        bot: { in: ["all", bot] },
        locale: { in: ["all", locale] },
      },
      select: { id: true, question: true },
    });
    let bestId: string | null = null;
    let bestScore = 0;
    for (const r of rows) {
      const faqWords = tokenize(r.question);
      if (faqWords.size === 0) continue;
      let overlap = 0;
      for (const w of faqWords) if (asked.has(w)) overlap++;
      const score = overlap / faqWords.size; // share of the FAQ's words asked
      if (score > bestScore) {
        bestScore = score;
        bestId = r.id;
      }
    }
    if (bestId && bestScore >= 0.6) {
      await prisma.aiFaq.update({
        where: { id: bestId },
        data: { hitCount: { increment: 1 }, lastHitAt: new Date() },
      });
    }
  } catch {
    // Best-effort — swallow.
  }
}
