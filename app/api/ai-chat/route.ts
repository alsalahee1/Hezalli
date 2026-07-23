import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { runAssistant, type ChatMessage } from "@/lib/ai/assistant";
import { checkGlobalCaps } from "@/lib/ai/guards";
import { geminiConfigured, GeminiError } from "@/lib/ai/gemini";
import { rateLimit } from "@/lib/rate-limit";
import { routing } from "@/i18n/routing";

// Best-effort client IP for throttling (behind the platform's proxy).
function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (
    fwd?.split(",")[0] ||
    req.headers.get("x-real-ip") ||
    "unknown"
  ).trim();
}

// The assistant hits the DB and an external API, so it can't be statically
// cached.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const bodySchema = z.object({
  // Full conversation so far, oldest first. The last entry is the new message.
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        text: z.string().min(1).max(2000),
      }),
    )
    .min(1)
    .max(20),
  locale: z.enum(["ar", "en"]).optional(),
});

export async function POST(req: NextRequest) {
  if (!geminiConfigured()) {
    return NextResponse.json(
      { error: "assistant_unavailable" },
      { status: 503 },
    );
  }

  // This endpoint is unauthenticated and each call fans out to several paid
  // Gemini requests, so throttle abuse two ways: a per-IP burst limit, plus the
  // same global daily/spend backstop the messaging channels use. Without this a
  // scripted loop can run up an unbounded Gemini bill.
  if (!rateLimit(`aichat:${clientIp(req)}`, 15, 60_000).ok) {
    return NextResponse.json({ error: "assistant_busy" }, { status: 429 });
  }
  if (!(await checkGlobalCaps(Date.now())).ok) {
    return NextResponse.json({ error: "assistant_busy" }, { status: 429 });
  }

  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const session = await auth();
  const spLocale = req.nextUrl.searchParams.get("locale");
  const locale =
    parsed.locale ??
    (spLocale === "ar" || spLocale === "en" ? spLocale : routing.defaultLocale);

  const history: ChatMessage[] = parsed.messages;

  try {
    const reply = await runAssistant(history, {
      locale,
      userId: session?.user?.id ?? null,
    });
    return NextResponse.json(reply);
  } catch (err) {
    // Rate limit / quota exhausted upstream — surface as a retryable 429 so the
    // UI can show a "busy, try again" message instead of a hard error.
    if (err instanceof GeminiError && err.status === 429) {
      console.warn("[ai-chat] gemini quota/rate limit:", err.message);
      return NextResponse.json({ error: "assistant_busy" }, { status: 429 });
    }
    console.error("[ai-chat] assistant failed:", err);
    return NextResponse.json({ error: "assistant_failed" }, { status: 500 });
  }
}
