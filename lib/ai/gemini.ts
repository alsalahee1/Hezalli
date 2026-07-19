// Minimal, dependency-free client for the Google Gemini REST API.
//
// We talk to the `generateContent` endpoint with plain `fetch` instead of
// pulling in an SDK: the surface we need (text + function calling) is small,
// and this keeps the dependency tree and bundle lean. The multi-turn
// function-calling loop lives in `lib/ai/assistant.ts`; this file only knows
// how to send one request and shape the response.

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

// Fast + cheap model, good enough for a storefront assistant. Overridable so
// the deployment can bump it without a code change.
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
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
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: opts.contents,
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 1024,
    },
  };
  if (opts.tools?.length) {
    body.tools = [{ functionDeclarations: opts.tools }];
  }

  const res = await fetch(
    `${API_BASE}/models/${GEMINI_MODEL}:generateContent`,
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
