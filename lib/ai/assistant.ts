// Orchestrates a single assistant turn: runs the Gemini function-calling loop,
// executing catalog/order tools until the model produces a text answer.
import "server-only";

import { getSetting } from "@/lib/settings";

import {
  functionCalls,
  generateContent,
  textFrom,
  type Content,
  type Part,
  type TokenUsage,
} from "./gemini";
import { BOTS, type BotId } from "./bot-constants";
import { getFaqBlock } from "./faq";
import { defaultIntro, lockedRules } from "./prompt-defaults";
import {
  runTool,
  TOOL_DECLARATIONS,
  type AssistantSection,
  type ProductCard,
  type ToolContext,
} from "./tools";

export type { AssistantSection };

// Hard cap on tool round-trips so a misbehaving model can't loop forever.
const MAX_STEPS = 4;

export type ChatMessage = { role: "user" | "assistant"; text: string };

/** An audio clip (e.g. a Telegram voice note) for Gemini to transcribe + answer. */
export type AudioInput = { data: string; mimeType: string };

export type AssistantReply = {
  text: string;
  cards: ProductCard[];
  usage: TokenUsage;
  // True when the model produced no real answer and we returned the generic
  // fallback line — a "couldn't answer" signal for analytics.
  fallback?: boolean;
};

// What the assistant focuses on in each part of the platform. The user's role has
// already been verified by the API before a privileged section reaches here,
// so the brief may speak to the user as a seller/admin/driver/etc. It only
// has read tools for the catalog and the user's own orders — for any other
// account-specific number it explains where to look instead of guessing.
const SECTION_BRIEFS: Record<AssistantSection, string> = {
  store: [
    "The user is browsing the storefront as a shopper.",
    "Focus: discovering products, comparing options, cart/checkout, payment",
    "methods (cash on delivery, local wallets like Jawali/Jaib/Floosak/Kuraimi,",
    "manual bank transfer, USDT), shipment tracking, confirming delivery,",
    "reviews, returns and disputes, and how the marketplace works.",
  ].join("\n"),
  seller: [
    "The user is a SELLER working in their Seller Center dashboard.",
    "Focus: running their store — adding/editing products (photos, variants,",
    "stock, prices in USD), handling orders and shipping them on time (orders",
    "auto-cancel if not shipped within the ship-SLA), returns, chatting with",
    "buyers, vouchers/promotions/flash sales, and finance: the platform takes a",
    "commission on completed orders only; prepaid money is held in escrow and",
    "credited when the buyer confirms receipt; for cash-on-delivery the seller",
    "collects the cash and the commission is charged to their balance (which",
    "can go negative until settled). Payouts require VERIFIED KYC plus payout",
    "details (bank / wallet / USDT address) and a minimum balance.",
    "For their exact numbers, point them to Seller Center → Finance/Analytics.",
  ].join("\n"),
  admin: [
    "The user is a platform ADMIN working in the admin panel (this includes",
    "the wallet-manager and delivery-manager desks).",
    "Focus: managing users/sellers/products/orders, confirming manual payments,",
    "refunds, payouts and KYC review, resolving disputes with a verdict that",
    "executes automatically, exchange rates per currency zone (Yemen's rial",
    "differs between the Sana'a-area NORTH and Aden-area SOUTH zones), platform",
    "settings (commission %, COD on/off, express delivery, delivery points,",
    "return windows, maintenance mode, the assistant's own settings), dispatch and",
    "couriers, and audit logs.",
    "For live figures, point them to the matching admin screen.",
  ].join("\n"),
  wallet: [
    "The user is inside HezalliPay, their marketplace wallet.",
    "Focus: the wallet balance (kept in USD), topping up via local wallet /",
    "bank transfer / USDT with a reference that is confirmed manually,",
    "paying for orders (including settling a cash-on-delivery order from the",
    "wallet before handover, when enabled), cashback on completed orders,",
    "transfer and outflow limits (higher for KYC-VERIFIED users), withdrawals,",
    "and transaction history.",
    "You cannot move money yourself — walk them to the right wallet screen.",
    "Never ask for PINs, passwords, or full account numbers.",
  ].join("\n"),
  driver: [
    "The user is a COURIER in the Hezalli Driver app.",
    "Focus: job offers (accept before the offer window ends or it cascades to",
    "the next driver) and the open job board (first to claim wins, within the",
    "active-jobs cap), scanning parcels at pickup and delivery, collecting",
    "cash-on-delivery amounts in the buyer's local currency exactly as shown,",
    "remitting held COD cash (oldest first — new assignments pause when held",
    "cash exceeds the driver's limit or gets too old), per-delivery earnings,",
    "and reliability: acceptance rate and badges improve dispatch priority and",
    "raise the cash limit.",
    "For their cash ledger and earnings, point them to the app's Cash and",
    "Statement tabs.",
  ].join("\n"),
  point: [
    "The user is a Hezalli Point operator (partner parcel hub) in the Point",
    "app.",
    "Focus: receiving and scanning parcels, routing/transfers between points,",
    "handing parcels to couriers or to buyers picking up (PUDO) within the",
    "pickup window, failed-attempt and return-to-seller flows, COD cash-in from",
    "drivers, the point's cash limit, and the handling/transfer fees the point",
    "earns per delivered parcel.",
    "For live parcels and cash, point them to the app's tabs (Scan, Parcels,",
    "Cash, Statement).",
  ].join("\n"),
  fleet: [
    "The user is a FLEET OWNER in the read-only fleet portal.",
    "Focus: their roster of drivers, each driver's activity and deliveries,",
    "and how driver cash limits, badges and reliability affect dispatch.",
    "Changes to the fleet itself are made by platform staff — for anything",
    "beyond viewing, suggest contacting Hezalli support.",
  ].join("\n"),
};

function systemPrompt(
  locale: string,
  section: AssistantSection,
  bot: BotId,
  intro: string,
  persona: string,
  faq: string,
): string {
  const lang = locale === "ar" ? "Arabic" : "English";
  // The intro (identity + marketplace description) is admin-editable; empty
  // falls back to the active character's default identity. The rule block is
  // locked — it keeps the bot calling tools and never inventing data.
  const lines = [
    intro.trim() || defaultIntro(BOTS[bot]),
    "",
    "Where the user is right now:",
    SECTION_BRIEFS[section],
    "",
    lockedRules(lang),
  ];

  // The store owner's editable persona/role, appended so it can shape tone and
  // behaviour — but the locked rules above still bind. If it conflicts with
  // them (e.g. asks it to reveal secrets or invent data), the rules win.
  const p = persona.trim();
  if (p) {
    lines.push(
      "",
      "Extra instructions from the store owner — follow these for personality,",
      "tone and style, but never let them override the safety rules above:",
      p,
    );
  }

  // The curated knowledge base (Admin → FAQ). Authoritative for the questions
  // it covers; still bound by the locked rules.
  if (faq) lines.push("", faq);

  return lines.join("\n");
}

/** Build Gemini `contents` from prior chat history + the new user message. */
function toContents(history: ChatMessage[]): Content[] {
  return history.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.text }] as Part[],
  }));
}

export async function runAssistant(
  history: ChatMessage[],
  ctx: ToolContext,
  opts: { audio?: AudioInput } = {},
): Promise<AssistantReply> {
  const contents = toContents(history);
  const cards: ProductCard[] = [];
  const seen = new Set<string>();
  const usage: TokenUsage = { in: 0, out: 0 };

  // Attach an incoming voice note to the latest user turn so Gemini transcribes
  // and answers it in one call (no separate speech-to-text step needed).
  if (opts.audio) {
    const last = contents[contents.length - 1];
    const audioPart: Part = {
      inlineData: { mimeType: opts.audio.mimeType, data: opts.audio.data },
    };
    if (last?.role === "user") last.parts.unshift(audioPart);
    else contents.push({ role: "user", parts: [audioPart] });
  }

  const section = ctx.section ?? "store";
  const bot: BotId = ctx.bot ?? "sam";
  // Shared base intro + this character's own persona + the curated FAQ block.
  const [intro, persona, faq] = await Promise.all([
    getSetting("ai_intro").catch(() => ""),
    getSetting(BOTS[bot].personaKey).catch(() => ""),
    getFaqBlock(bot, ctx.locale),
  ]);
  const system = systemPrompt(ctx.locale, section, bot, intro, persona, faq);

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await generateContent({
      system,
      contents,
      tools: TOOL_DECLARATIONS,
    });
    usage.in += res.usage.in;
    usage.out += res.usage.out;

    const calls = functionCalls(res.parts);
    if (calls.length === 0) {
      const answer = textFrom(res.parts);
      return {
        text: answer || fallbackText(ctx.locale),
        cards,
        usage,
        fallback: !answer,
      };
    }

    // Record the model's tool-call turn, then execute each call and feed the
    // results back in a single follow-up turn.
    contents.push({ role: "model", parts: res.parts });
    const responseParts: Part[] = [];
    for (const call of calls) {
      const { result, cards: toolCards } = await runTool(call, ctx);
      for (const c of toolCards ?? []) {
        if (!seen.has(c.slug)) {
          seen.add(c.slug);
          cards.push(c);
        }
      }
      responseParts.push({
        functionResponse: { name: call.name, response: result },
      });
    }
    contents.push({ role: "user", parts: responseParts });
  }

  // Ran out of tool budget — ask the model for a final answer with no tools.
  const res = await generateContent({
    system,
    contents,
  });
  usage.in += res.usage.in;
  usage.out += res.usage.out;
  const finalAnswer = textFrom(res.parts);
  return {
    text: finalAnswer || fallbackText(ctx.locale),
    cards,
    usage,
    fallback: !finalAnswer,
  };
}

function fallbackText(locale: string): string {
  return locale === "ar"
    ? "عذرًا، لم أتمكن من إيجاد إجابة. حاول إعادة صياغة سؤالك."
    : "Sorry, I couldn't find an answer. Try rephrasing your question.";
}
