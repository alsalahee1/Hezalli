// The set of assistant "characters" a shopper can talk to. Plain module (no
// server-only) so both client switchers and server resolvers can import it.
//
// Each bot shares the same knowledge, tools, rules, persona and behaviour
// settings — only the identity differs: name, avatar, and presented gender
// (which matters for Arabic gendered forms). Admins pick the default; users
// override it with a cookie via the switcher.

export const BOT_COOKIE = "hz_bot";

export type BotId = "shadi" | "jumana";

export type BotDef = {
  id: BotId;
  nameEn: string;
  nameAr: string;
  /** Bundled image used when no custom avatar is set for this bot. */
  defaultAvatar: string;
  gender: "male" | "female";
  /** getSetting key holding this bot's custom avatar override. */
  avatarKey: "ai_assistant_avatar" | "ai_avatar_jumana";
};

export const BOTS: Record<BotId, BotDef> = {
  shadi: {
    id: "shadi",
    nameEn: "Shadi",
    nameAr: "شادي",
    defaultAvatar: "/shadi.jpg",
    gender: "male",
    avatarKey: "ai_assistant_avatar",
  },
  jumana: {
    id: "jumana",
    nameEn: "Jumana",
    nameAr: "جُمانة",
    defaultAvatar: "/jumana.jpg",
    gender: "female",
    avatarKey: "ai_avatar_jumana",
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
