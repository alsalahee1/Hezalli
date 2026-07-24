// Server-side resolution of which assistant character is active, and its
// avatar. Priority: the shopper's cookie choice → the admin default
// (ai_default_bot) → the male character.
import "server-only";

import { cookies } from "next/headers";

import { getSetting } from "@/lib/settings";

import { BOT_COOKIE, BOTS, normalizeBotId, type BotId } from "./bot-constants";

export async function getActiveBot(): Promise<BotId> {
  const raw = (await cookies()).get(BOT_COOKIE)?.value;
  // The switcher cookie is "<botId>.<epochMs>" (older cookies are a bare id,
  // read as stamp 0). It only overrides the platform default if the shopper
  // switched AFTER the admin last changed the default — so changing the
  // default re-applies it to everyone who hasn't since picked for themselves.
  if (raw) {
    const dot = raw.lastIndexOf(".");
    const id = normalizeBotId(dot === -1 ? raw : raw.slice(0, dot));
    const at = dot === -1 ? 0 : Number(raw.slice(dot + 1)) || 0;
    if (id && at >= (await defaultChangedAt())) return id;
  }
  return getDefaultBot();
}

/** The admin-chosen default character (ai_default_bot), or the male one. */
export async function getDefaultBot(): Promise<BotId> {
  try {
    const def = normalizeBotId(await getSetting("ai_default_bot"));
    if (def) return def;
  } catch {
    // fall through
  }
  return "sam";
}

/** Epoch-ms of the last admin change to the default character (0 if never). */
async function defaultChangedAt(): Promise<number> {
  try {
    return Number(await getSetting("ai_default_bot_at")) || 0;
  } catch {
    return 0;
  }
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
