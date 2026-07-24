// Per-character assistant analytics: writing turn events (fire-and-forget) and
// aggregating them for the Admin → Shadi stats page.
import "server-only";

import { prisma } from "@/lib/prisma";

import { BOTS, type BotId } from "./bot-constants";

export const VISITOR_COOKIE = "hz_vid";

/** Record one assistant turn. Never throws — analytics must not break chat. */
export async function logAiEvent(e: {
  bot: BotId;
  channel: "web" | "telegram" | "whatsapp";
  section: string;
  locale: string;
  userId?: string | null;
  visitorId?: string | null;
  question: string;
  tokensIn?: number;
  tokensOut?: number;
}): Promise<void> {
  const question = (e.question || "").trim().slice(0, 300);
  if (!question) return;
  try {
    await prisma.aiChatEvent.create({
      data: {
        bot: e.bot,
        channel: e.channel,
        section: e.section,
        locale: e.locale,
        userId: e.userId ?? null,
        visitorId: e.visitorId ?? null,
        question,
        tokensIn: e.tokensIn ?? 0,
        tokensOut: e.tokensOut ?? 0,
      },
    });
  } catch {
    // Best-effort — swallow (table missing during rollout, DB hiccup, …).
  }
}

// ── Aggregation for the stats page ───────────────────────────────────────

export type BotStat = {
  bot: BotId;
  messages: number;
  users: number;
  tokensIn: number;
  tokensOut: number;
  messageShare: number; // 0..1 of all messages in the window
  userShare: number; // 0..1 of all users in the window
  topSections: Array<{ section: string; count: number }>;
  topQuestions: Array<{ question: string; count: number }>;
};

export type AssistantStats = {
  days: number;
  totalMessages: number;
  totalUsers: number;
  perBot: BotStat[];
  // Message counts per day (UTC) per bot, oldest first — for a small bar chart.
  daily: Array<{ day: string; counts: Record<string, number> }>;
};

const dayStr = (d: Date) => d.toISOString().slice(0, 10);

export async function getAssistantStats(
  days: number,
  now: number,
): Promise<AssistantStats> {
  const since = new Date(now - days * 86_400_000);
  const botIds = Object.keys(BOTS) as BotId[];

  // Messages + tokens per bot.
  const grouped = await prisma.aiChatEvent.groupBy({
    by: ["bot"],
    where: { createdAt: { gte: since } },
    _count: { _all: true },
    _sum: { tokensIn: true, tokensOut: true },
  });
  const byBot = new Map(grouped.map((g) => [g.bot, g]));

  // Distinct "users" per bot = distinct signed-in user or anonymous visitor.
  const distinctRows = await prisma.$queryRaw<
    Array<{ bot: string; users: bigint }>
  >`
    SELECT "bot", COUNT(DISTINCT COALESCE("userId", "visitorId")) AS users
    FROM "AiChatEvent"
    WHERE "createdAt" >= ${since}
    GROUP BY "bot"
  `;
  const usersByBot = new Map(distinctRows.map((r) => [r.bot, Number(r.users)]));

  // Top sections + top questions per bot (a couple of small grouped queries).
  const [sectionRows, questionRows] = await Promise.all([
    prisma.aiChatEvent.groupBy({
      by: ["bot", "section"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.aiChatEvent.groupBy({
      by: ["bot", "question"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { question: "desc" } },
      take: 200, // trimmed to top-per-bot below
    }),
  ]);

  const totalMessages = grouped.reduce((s, g) => s + g._count._all, 0);
  const totalUsers = distinctRows.reduce((s, r) => s + Number(r.users), 0);

  const perBot: BotStat[] = botIds.map((bot) => {
    const g = byBot.get(bot);
    const messages = g?._count._all ?? 0;
    const users = usersByBot.get(bot) ?? 0;
    const topSections = sectionRows
      .filter((r) => r.bot === bot)
      .map((r) => ({ section: r.section, count: r._count._all }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
    const topQuestions = questionRows
      .filter((r) => r.bot === bot)
      .map((r) => ({ question: r.question, count: r._count._all }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
    return {
      bot,
      messages,
      users,
      tokensIn: g?._sum.tokensIn ?? 0,
      tokensOut: g?._sum.tokensOut ?? 0,
      messageShare: totalMessages ? messages / totalMessages : 0,
      userShare: totalUsers ? users / totalUsers : 0,
      topSections,
      topQuestions,
    };
  });

  // Daily message counts per bot (client renders a small bar chart).
  const dailyRows = await prisma.$queryRaw<
    Array<{ day: string; bot: string; count: bigint }>
  >`
    SELECT to_char("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
           "bot", COUNT(*) AS count
    FROM "AiChatEvent"
    WHERE "createdAt" >= ${since}
    GROUP BY 1, "bot"
    ORDER BY 1 ASC
  `;
  const dayMap = new Map<string, Record<string, number>>();
  // Seed every day in the window so the chart has no gaps.
  for (let i = days - 1; i >= 0; i--) {
    dayMap.set(dayStr(new Date(now - i * 86_400_000)), {});
  }
  for (const r of dailyRows) {
    const row = dayMap.get(r.day) ?? {};
    row[r.bot] = Number(r.count);
    dayMap.set(r.day, row);
  }
  const daily = Array.from(dayMap.entries()).map(([day, counts]) => ({
    day,
    counts,
  }));

  return { days, totalMessages, totalUsers, perBot, daily };
}
