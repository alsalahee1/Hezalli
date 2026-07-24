// Minimal, dependency-free client for the Google Gemini REST API.
//
// We talk to the `generateContent` endpoint with plain `fetch` instead of
// pulling in an SDK: the surface we need (text + function calling) is small,
// and this keeps the dependency tree and bundle lean. The multi-turn
// function-calling loop lives in `lib/ai/assistant.ts`; this file only knows
// how to send one request and shape the response.

import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

// Fast + cheap model, good enough for a storefront assistant. Admins can
// override it from the assistant settings page; the env var is the next fallback.
const DEFAULT_MODEL = "gemini-2.5-flash";

export async function getGeminiModel(): Promise<string> {
  try {
    const m = (await getSetting("ai_gemini_model")).trim();
    if (m) return m;
  } catch {
    // DB hiccup — fall through to env/default.
  }
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

/**
 * Admin-tunable reply creativity + length (Admin → Assistant). Both are clamped to
 * safe ranges; on any DB hiccup we fall back to the built-in defaults.
 */
async function getGenerationConfig(): Promise<{
  temperature: number;
  maxOutputTokens: number;
}> {
  let temperature = 0.3;
  let maxOutputTokens = 1024;
  try {
    const t = await getSetting("ai_temperature");
    if (Number.isFinite(t)) temperature = Math.min(1, Math.max(0, t));
    const m = await getSetting("ai_max_tokens");
    if (Number.isFinite(m) && m > 0)
      maxOutputTokens = Math.min(8192, Math.max(128, Math.trunc(m)));
  } catch {
    // Keep the defaults.
  }
  return { temperature, maxOutputTokens };
}

/**
 * Resolve the Gemini API key. The admin-managed platform setting (Admin →
 * Settings) wins so the key can be rotated without a redeploy; the
 * GEMINI_API_KEY environment variable is the fallback. Stored as its own
 * PlatformSetting row rather than inside getPlatformSettings() so the secret
 * never rides along when pages pass the settings object around.
 */
export async function getGeminiKey(): Promise<string> {
  try {
    const row = await prisma.platformSetting.findUnique({
      where: { key: "gemini_api_key" },
      select: { value: true },
    });
    if (typeof row?.value === "string" && row.value.trim()) {
      return row.value.trim();
    }
  } catch {
    // DB hiccup — fall through to the environment key so the bot stays up.
  }
  return (process.env.GEMINI_API_KEY || "").trim();
}

export async function geminiConfigured(): Promise<boolean> {
  return Boolean(await getGeminiKey());
}

/**
 * Whether the assistant should run at all: the admin toggle is on AND a Gemini
 * key is available. Gates the site widget, the chat API, and the messaging
 * channels alike.
 */
export async function assistantReady(): Promise<boolean> {
  if (!(await getSetting("ai_assistant_enabled"))) return false;
  return geminiConfigured();
}

/** Error carrying the upstream HTTP status so callers can react (e.g. 429). */
export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

// --- Wire types (a pragmatic subset of the Gemini schema) ---------------

export type FunctionCall = { name: string; args: Record<string, unknown> };

export type Part =
  | { text: string }
  | { functionCall: FunctionCall }
  | { functionResponse: { name: string; response: Record<string, unknown> } }
  | { inlineData: { mimeType: string; data: string } };

export type Content = { role: "user" | "model"; parts: Part[] };

export type FunctionDeclaration = {
  name: string;
  description: string;
  // JSON-Schema-ish object the model fills in when calling the function.
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
};

export type TokenUsage = { in: number; out: number };

type GenerateResult = {
  parts: Part[];
  finishReason: string | null;
  usage: TokenUsage;
};

/** Send one `generateContent` request and return the model's parts. */
export async function generateContent(opts: {
  system: string;
  contents: Content[];
  tools?: FunctionDeclaration[];
  signal?: AbortSignal;
}): Promise<GenerateResult> {
  const apiKey = await getGeminiKey();
  if (!apiKey) throw new Error("No Gemini API key configured");

  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: opts.contents,
    generationConfig: await getGenerationConfig(),
  };
  if (opts.tools?.length) {
    body.tools = [{ functionDeclarations: opts.tools }];
  }

  const res = await fetch(
    `${API_BASE}/models/${await getGeminiModel()}:generateContent`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new GeminiError(
      `Gemini API error ${res.status}: ${detail.slice(0, 500)}`,
      res.status,
    );
  }

  const data = (await res.json()) as {
    candidates?: {
      content?: { parts?: Part[] };
      finishReason?: string;
    }[];
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
    };
  };

  const candidate = data.candidates?.[0];
  return {
    parts: candidate?.content?.parts ?? [],
    finishReason: candidate?.finishReason ?? null,
    usage: {
      in: data.usageMetadata?.promptTokenCount ?? 0,
      out: data.usageMetadata?.candidatesTokenCount ?? 0,
    },
  };
}

/** Pull the function calls out of a response's parts (may be more than one). */
export function functionCalls(parts: Part[]): FunctionCall[] {
  return parts
    .filter((p): p is { functionCall: FunctionCall } => "functionCall" in p)
    .map((p) => p.functionCall);
}

/** Concatenate all text parts of a response into a single string. */
export function textFrom(parts: Part[]): string {
  return parts
    .filter((p): p is { text: string } => "text" in p)
    .map((p) => p.text)
    .join("")
    .trim();
}
