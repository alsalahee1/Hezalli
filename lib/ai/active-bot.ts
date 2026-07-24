// Server-side resolution of which assistant character is active, and its
// avatar. Priority: the shopper's cookie choice → the admin default
// (ai_default_bot) → Shadi.
import "server-only";

import { cookies } from "next/headers";

import { getSetting } from "@/lib/settings";

import { BOT_COOKIE, BOTS, isBotId, type BotId } from "./bot-constants";

export async function getActiveBot(): Promise<BotId> {
  const cookie = (await cookies()).get(BOT_COOKIE)?.value;
  if (isBotId(cookie)) return cookie;
  return getDefaultBot();
}

/** The admin-chosen default character (ai_default_bot), or Shadi. */
export async function getDefaultBot(): Promise<BotId> {
  try {
    const def = await getSetting("ai_default_bot");
    if (isBotId(def)) return def;
  } catch {
    // fall through
  }
  return "shadi";
}

/** A bot's avatar: its custom override if set, else the bundled default. */
export async function getBotAvatar(id: BotId): Promise<string> {
  try {
    const v = (await getSetting(BOTS[id].avatarKey)).trim();
    if (v) return v;
  } catch {
    // fall through
  }
  return BOTS[id].defaultAvatar;
}
