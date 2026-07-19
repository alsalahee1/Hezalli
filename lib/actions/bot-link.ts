"use server";

import { auth } from "@/auth";
import { finishLink, unlinkUser } from "@/lib/ai/account-link";

type Result = { ok?: boolean; error?: string; platform?: string };

/** Bind the Telegram (or other) chat that produced `code` to the signed-in user. */
export async function linkBotAccount(code: string): Promise<Result> {
  const session = await auth();
  if (!session?.user?.id) return { error: "unauthorized" };

  const trimmed = (code || "").trim();
  if (!trimmed) return { error: "invalid" };

  const res = await finishLink(trimmed, session.user.id);
  return res.ok ? { ok: true, platform: res.platform } : { error: res.error };
}

/** Remove the signed-in user's link on a platform (default: telegram). */
export async function unlinkBotAccount(platform = "telegram"): Promise<Result> {
  const session = await auth();
  if (!session?.user?.id) return { error: "unauthorized" };
  await unlinkUser(session.user.id, platform);
  return { ok: true };
}
