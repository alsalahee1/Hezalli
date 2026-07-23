import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import {
  runAssistant,
  type AssistantSection,
  type ChatMessage,
} from "@/lib/ai/assistant";
import { getActiveBot } from "@/lib/ai/active-bot";
import { checkGlobalCaps } from "@/lib/ai/guards";
import { assistantReady, GeminiError } from "@/lib/ai/gemini";
import { prisma } from "@/lib/prisma";
import { rateLimitAsync } from "@/lib/rate-limit";
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
  // Where the widget was opened from. Client-reported, so privileged sections
  // are verified against the user's real roles below.
  section: z
    .enum(["store", "seller", "admin", "wallet", "driver", "point", "fleet"])
    .optional(),
});

/**
 * A privileged section only sticks if the signed-in user actually holds the
 * matching role — otherwise Shadi quietly runs in shopper mode. The section
 * only tailors guidance (no extra data tools), but role-checking keeps the
 * prompt honest about who it's talking to.
 */
async function resolveSection(
  requested: AssistantSection,
  userId: string | null,
): Promise<AssistantSection> {
  if (requested === "store") return "store";
  if (!userId) return "store";
  if (requested === "wallet") return "wallet"; // any signed-in user has one

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      roles: true,
      ownedFleet: { select: { isActive: true } },
      deliveryPoint: { select: { status: true } },
    },
  });
  const ok =
    requested === "seller"
      ? user?.roles.includes("SELLER")
      : requested === "admin"
        ? user?.roles.includes("ADMIN")
        : requested === "driver"
          ? user?.roles.includes("COURIER")
          : requested === "point"
            ? user?.roles.includes("DELIVERY_POINT") &&
              user?.deliveryPoint?.status === "ACTIVE"
            : requested === "fleet"
              ? (user?.ownedFleet?.isActive ?? false)
              : false;
  return ok ? requested : "store";
}

export async function POST(req: NextRequest) {
  if (!(await assistantReady())) {
    return NextResponse.json(
      { error: "assistant_unavailable" },
      { status: 503 },
    );
  }

  // This endpoint is unauthenticated and each call fans out to several paid
  // Gemini requests, so throttle abuse two ways: a per-IP burst limit, plus the
  // same global daily/spend backstop the messaging channels use. Without this a
  // scripted loop can run up an unbounded Gemini bill.
  if (!(await rateLimitAsync(`aichat:${clientIp(req)}`, 15, 60_000)).ok) {
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
  const section = await resolveSection(
    parsed.section ?? "store",
    session?.user?.id ?? null,
  );
  // Which character is active for this shopper (cookie → admin default).
  const bot = await getActiveBot();

  try {
    const reply = await runAssistant(history, {
      locale,
      userId: session?.user?.id ?? null,
      section,
      bot,
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
