// The set of assistant "characters" a shopper can talk to. Plain module (no
// server-only) so both client switchers and server resolvers can import it.
//
// Each bot shares the same knowledge, tools, rules, persona and behaviour
// settings — only the identity differs: name, avatar, and presented gender
// (which matters for Arabic gendered forms). Admins pick the default; users
// override it with a cookie via the switcher.

export const BOT_COOKIE = "hz_bot";

export type BotId = "sam" | "balqis";

export type BotDef = {
  id: BotId;
  nameEn: string;
  nameAr: string;
  /** Bundled image used when no custom avatar is set for this bot. */
  defaultAvatar: string;
  gender: "male" | "female";
  // getSetting keys holding this bot's per-character overrides. The male
  // character reuses the original single-bot keys (zero migration); the
  // female character gets her own.
  avatarKey: "ai_assistant_avatar" | "ai_avatar_balqis";
  personaKey: "ai_persona" | "ai_persona_balqis";
  greetingKey: "ai_greeting" | "ai_greeting_balqis";
};

export const BOTS: Record<BotId, BotDef> = {
  sam: {
    id: "sam",
    nameEn: "Sam",
    nameAr: "سام",
    defaultAvatar: "/sam.jpg",
    gender: "male",
    avatarKey: "ai_assistant_avatar",
    personaKey: "ai_persona",
    greetingKey: "ai_greeting",
  },
  balqis: {
    id: "balqis",
    nameEn: "Balqis",
    nameAr: "بلقيس",
    defaultAvatar: "/balqis.png",
    gender: "female",
    avatarKey: "ai_avatar_balqis",
    personaKey: "ai_persona_balqis",
    greetingKey: "ai_greeting_balqis",
  },
};

export const BOT_IDS = Object.keys(BOTS) as BotId[];

export function isBotId(v: unknown): v is BotId {
  return typeof v === "string" && v in BOTS;
}

/** The character's display name in the shopper's language. */
export function botName(id: BotId, locale: string): string {
  return locale === "ar" ? BOTS[id].nameAr : BOTS[id].nameEn;
}
