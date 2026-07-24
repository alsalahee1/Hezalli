"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireAdminId } from "@/lib/authz";
import { BOT_IDS } from "@/lib/ai/bot-constants";
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
