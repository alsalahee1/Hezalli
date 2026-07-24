"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireAdminId } from "@/lib/authz";
import { BOT_IDS, BOTS, isBotId } from "@/lib/ai/bot-constants";
import { assistantReady, generateContent } from "@/lib/ai/gemini";
import { prisma } from "@/lib/prisma";

type Result = { ok?: boolean; error?: string; id?: string };

const BOT_SCOPES = ["all", ...BOT_IDS];
const LOCALES = ["all", "ar", "en"];

export type FaqInput = {
  id?: string;
  question: string;
  answer: string;
  bot: string;
  locale: string;
  enabled: boolean;
};

function clean(input: FaqInput):
  | { error: string }
  | {
      question: string;
      answer: string;
      bot: string;
      locale: string;
      enabled: boolean;
    } {
  const question = (input.question || "").trim().slice(0, 400);
  const answer = (input.answer || "").trim().slice(0, 4000);
  if (!question || !answer) return { error: "empty" };
  const bot = BOT_SCOPES.includes(input.bot) ? input.bot : "all";
  const locale = LOCALES.includes(input.locale) ? input.locale : "all";
  return { question, answer, bot, locale, enabled: Boolean(input.enabled) };
}

export async function saveFaq(input: FaqInput): Promise<Result> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };
  const c = clean(input);
  if ("error" in c) return { error: c.error };

  const row = input.id
    ? await prisma.aiFaq.update({ where: { id: input.id }, data: c })
    : await prisma.aiFaq.create({ data: c });

  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: input.id ? "faq.update" : "faq.create",
      entity: "AiFaq",
      entityId: row.id,
      meta: { question: c.question, bot: c.bot, locale: c.locale },
    },
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/assistant/faq`);
  revalidatePath(`/${locale}`, "layout");
  return { ok: true, id: row.id };
}

export async function toggleFaq(id: string, enabled: boolean): Promise<Result> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };
  await prisma.aiFaq.update({ where: { id }, data: { enabled } });
  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/assistant/faq`);
  return { ok: true };
}

// Draft an answer with the AI for the admin to review/edit before saving.
// Grounded, concise, and honest about not inventing specific prices/policies.
export async function draftFaqAnswer(input: {
  question: string;
  bot: string;
  locale: string;
}): Promise<{ answer?: string; error?: string }> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };
  const question = (input.question || "").trim().slice(0, 400);
  if (!question) return { error: "empty" };
  if (!(await assistantReady())) return { error: "unavailable" };

  const character = isBotId(input.bot)
    ? BOTS[input.bot].nameEn
    : "the assistant";
  const lang =
    input.locale === "ar"
      ? "Arabic"
      : input.locale === "en"
        ? "English"
        : "the same language as the question";

  const system = [
    `You draft help-center answers for Hezalli, a Yemen multi-vendor marketplace, for its assistant (${character}).`,
    `Write a clear, friendly, concise answer (2–4 sentences) to the customer question below, in ${lang}.`,
    "Ground it in how the marketplace generally works (cash on delivery, local",
    "wallets, bank transfer and USDT payments, seller shipping with tracking,",
    "returns and buyer protection). Do NOT invent specific prices, dates, or",
    "policy numbers you can't be sure of — keep those general. Output only the",
    "answer text, no preamble.",
  ].join("\n");

  try {
    const res = await generateContent({
      system,
      contents: [{ role: "user", parts: [{ text: question }] }],
    });
    const answer = res.parts
      .filter((p): p is { text: string } => "text" in p)
      .map((p) => p.text)
      .join("")
      .trim();
    if (!answer) return { error: "aiFailed" };
    return { answer: answer.slice(0, 4000) };
  } catch {
    return { error: "aiFailed" };
  }
}

export async function deleteFaq(id: string): Promise<Result> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };
  await prisma.aiFaq.delete({ where: { id } }).catch(() => {});
  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "faq.delete",
      entity: "AiFaq",
      entityId: id,
      meta: {},
    },
  });
  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/assistant/faq`);
  return { ok: true };
}
