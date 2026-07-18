// Orchestrates a single assistant turn: runs the Gemini function-calling loop,
// executing catalog/order tools until the model produces a text answer.
import "server-only";

import {
  functionCalls,
  generateContent,
  textFrom,
  type Content,
  type Part,
} from "./gemini";
import {
  runTool,
  TOOL_DECLARATIONS,
  type ProductCard,
  type ToolContext,
} from "./tools";

// Hard cap on tool round-trips so a misbehaving model can't loop forever.
const MAX_STEPS = 4;

export type ChatMessage = { role: "user" | "assistant"; text: string };

export type AssistantReply = {
  text: string;
  cards: ProductCard[];
};

function systemPrompt(locale: string): string {
  const lang = locale === "ar" ? "Arabic" : "English";
  return [
    "You are Hezalli's friendly shopping assistant. Hezalli is a multi-vendor",
    "online marketplace (like Amazon or Noon) where independent sellers list",
    "products that buyers can search, add to cart, and order.",
    "",
    "Your job: help shoppers discover products, compare options, and answer",
    "questions about their orders, shipping, returns and how the marketplace works.",
    "",
    "Rules:",
    `- Reply in ${lang} (the shopper's current language). Keep answers concise and helpful.`,
    "- To recommend or find products, ALWAYS call search_products — never invent",
    "  products, prices, or links. Only talk about items the tools return.",
    "- Prices are in USD. Use the price strings exactly as the tools return them.",
    "- For questions about the shopper's own orders, call get_order_status.",
    "- If a tool says the shopper is not signed in, politely ask them to sign in.",
    "- If nothing matches, say so honestly and suggest a broader search.",
    "- Never ask for or handle passwords, card numbers, or other sensitive data.",
    "- Stay on topic: shopping and using Hezalli. Politely decline unrelated requests.",
  ].join("\n");
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
): Promise<AssistantReply> {
  const contents = toContents(history);
  const cards: ProductCard[] = [];
  const seen = new Set<string>();

  for (let step = 0; step < MAX_STEPS; step++) {
    const { parts } = await generateContent({
      system: systemPrompt(ctx.locale),
      contents,
      tools: TOOL_DECLARATIONS,
    });

    const calls = functionCalls(parts);
    if (calls.length === 0) {
      return { text: textFrom(parts) || fallbackText(ctx.locale), cards };
    }

    // Record the model's tool-call turn, then execute each call and feed the
    // results back in a single follow-up turn.
    contents.push({ role: "model", parts });
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
  const { parts } = await generateContent({
    system: systemPrompt(ctx.locale),
    contents,
  });
  return { text: textFrom(parts) || fallbackText(ctx.locale), cards };
}

function fallbackText(locale: string): string {
  return locale === "ar"
    ? "عذرًا، لم أتمكن من إيجاد إجابة. حاول إعادة صياغة سؤالك."
    : "Sorry, I couldn't find an answer. Try rephrasing your question.";
}
