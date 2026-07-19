// Account-linking handshake for the messaging bots. Flow:
//   1. In the bot the user sends /link → startLink() mints a one-time code on
//      their chat row and the bot replies with a website URL carrying the code.
//   2. On the website (signed in) finishLink() binds that chat to their Hezalli
//      account, so the assistant can answer their order questions.
// The code proves control of the chat; the signed-in session proves account
// ownership — together they authorize the link.
import "server-only";

import { randomBytes } from "node:crypto";

import { prisma } from "@/lib/prisma";

const CODE_TTL_MS = 10 * 60_000; // 10 minutes

/** Mint a fresh link code for a chat and return it (caller builds the URL). */
export async function startLink(
  platform: string,
  chatId: string,
  now: number = Date.now(),
): Promise<string> {
  const code = randomBytes(9).toString("base64url"); // ~12 url-safe chars
  const expires = new Date(now + CODE_TTL_MS);
  await prisma.botConversation.upsert({
    where: { platform_chatId: { platform, chatId } },
    create: {
      platform,
      chatId,
      linkCode: code,
      linkCodeExpiresAt: expires,
    },
    update: { linkCode: code, linkCodeExpiresAt: expires },
  });
  return code;
}

/** Bind a chat (identified by its live link code) to a signed-in account. */
export async function finishLink(
  code: string,
  userId: string,
  now: number = Date.now(),
): Promise<{ ok: true; platform: string } | { ok: false; error: string }> {
  const row = await prisma.botConversation.findUnique({
    where: { linkCode: code },
    select: { id: true, platform: true, linkCodeExpiresAt: true },
  });
  if (!row) return { ok: false, error: "invalid" };
  if (!row.linkCodeExpiresAt || row.linkCodeExpiresAt.getTime() < now) {
    return { ok: false, error: "expired" };
  }
  await prisma.botConversation.update({
    where: { id: row.id },
    data: { userId, linkCode: null, linkCodeExpiresAt: null },
  });
  return { ok: true, platform: row.platform };
}

/** Remove the account link for one chat (used by the bot's /unlink). */
export async function unlinkChat(
  platform: string,
  chatId: string,
): Promise<void> {
  await prisma.botConversation.updateMany({
    where: { platform, chatId },
    data: { userId: null },
  });
}

/** Unlink every chat bound to a user on a platform (used by the website). */
export async function unlinkUser(
  userId: string,
  platform: string,
): Promise<void> {
  await prisma.botConversation.updateMany({
    where: { userId, platform },
    data: { userId: null },
  });
}

/** Which platforms this user has an active bot link on. */
export async function linkedPlatforms(userId: string): Promise<string[]> {
  const rows = await prisma.botConversation.findMany({
    where: { userId },
    select: { platform: true },
    distinct: ["platform"],
  });
  return rows.map((r) => r.platform);
}
