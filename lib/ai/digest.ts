// The weekly assistant-stats digest: a 7-day recap of how Shadi & Jumana are
// doing, sent to the owner's Telegram. Triggered by the cron endpoint, or the
// "send test" button in Admin → Shadi.
import "server-only";

import { getSetting } from "@/lib/settings";
import {
  getTelegramToken,
  sendTelegramMessage,
} from "@/lib/integrations/telegram";
import { routing } from "@/i18n/routing";

import { botName, type BotId } from "./bot-constants";
import { assistantReady } from "./gemini";
import { getAssistantStats } from "./stats";

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Build the digest message text (plain, Telegram-friendly). */
export async function buildDigestText(
  days: number,
  now: number,
  locale: string,
): Promise<string> {
  const stats = await getAssistantStats(days, now);
  const ar = locale === "ar";
  const L = {
    title: ar
      ? `📊 ملخص مساعد هزلي — آخر ${days} أيام`
      : `📊 Hezalli assistant — last ${days} days`,
    totals: ar
      ? `الرسائل: ${stats.totalMessages} · المستخدمون: ${stats.totalUsers}`
      : `Messages: ${stats.totalMessages} · Users: ${stats.totalUsers}`,
    msgs: ar ? "رسائل" : "msgs",
    users: ar ? "مستخدم" : "users",
    cantAnswer: ar ? "تعذّر الإجابة" : "couldn't answer",
    top: ar ? "أكثر الأسئلة" : "Top questions",
    needs: ar ? "تحتاج انتباهًا" : "Needs attention",
    quiet: ar
      ? "لا نشاط للمساعد هذا الأسبوع."
      : "No assistant activity this week.",
    manage: ar
      ? "الإدارة: /admin/assistant/stats"
      : "Manage: /admin/assistant/stats",
  };

  if (stats.totalMessages === 0) {
    return `${L.title}\n\n${L.quiet}`;
  }

  const lines: string[] = [L.title, "", L.totals];

  for (const b of stats.perBot) {
    if (b.messages === 0) continue;
    const name = botName(b.bot as BotId, locale);
    lines.push(
      "",
      `— ${name}: ${b.messages} ${L.msgs} (${pct(b.messageShare)}) · ${b.users} ${L.users} · ${L.cantAnswer} ${pct(b.fallbackRate)}`,
    );
    if (b.topQuestions.length) {
      lines.push(`  ${L.top}:`);
      for (const q of b.topQuestions.slice(0, 3)) {
        lines.push(`   • ${q.question} ×${q.count}`);
      }
    }
    if (b.needsAttention.length) {
      lines.push(`  ⚠️ ${L.needs}:`);
      for (const q of b.needsAttention.slice(0, 3)) {
        lines.push(`   • ${q.question} ×${q.count}`);
      }
    }
  }

  lines.push("", L.manage);
  return lines.join("\n");
}

export type DigestResult =
  | { sent: true }
  | { sent: false; reason: "disabled" | "no_chat" | "not_ready" | "failed" };

/**
 * Send the weekly digest per the saved settings. `force` ignores the enabled
 * toggle (used by the admin "send test now" button); a chat id is always
 * required.
 */
export async function sendWeeklyDigest(
  now: number,
  opts: { force?: boolean } = {},
): Promise<DigestResult> {
  const enabled = await getSetting("ai_digest_enabled");
  if (!opts.force && !enabled) return { sent: false, reason: "disabled" };

  const chatId = (await getSetting("ai_digest_chat_id")).trim();
  if (!chatId) return { sent: false, reason: "no_chat" };

  // Needs a working bot to send through, and the assistant on to have data.
  if (!(await getTelegramToken()) || !(await assistantReady())) {
    return { sent: false, reason: "not_ready" };
  }

  try {
    const text = await buildDigestText(7, now, routing.defaultLocale);
    await sendTelegramMessage(chatId, text);
    return { sent: true };
  } catch (err) {
    console.error("[assistant-digest] send failed:", err);
    return { sent: false, reason: "failed" };
  }
}
