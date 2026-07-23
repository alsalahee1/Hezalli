import { after, NextResponse, type NextRequest } from "next/server";

import { assistantReady } from "@/lib/ai/gemini";
import {
  processWhatsAppPayload,
  type WhatsAppPayload,
} from "@/lib/integrations/whatsapp-runtime";
import {
  verifyWhatsAppSignature,
  whatsappConfigured,
} from "@/lib/integrations/whatsapp";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// GET: Meta's webhook verification handshake. Echo hub.challenge when the
// verify token matches.
export function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const mode = sp.get("hub.mode");
  const token = sp.get("hub.verify_token");
  const challenge = sp.get("hub.challenge");
  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

// POST: inbound messages + status callbacks.
export async function POST(req: NextRequest) {
  if (!whatsappConfigured() || !(await assistantReady())) {
    return NextResponse.json({ ok: true });
  }

  // Read the raw body so we can verify the signature before trusting it.
  const raw = await req.text();
  if (!verifyWhatsAppSignature(raw, req.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let payload: WhatsAppPayload;
  try {
    payload = JSON.parse(raw) as WhatsAppPayload;
  } catch {
    return NextResponse.json({ ok: true });
  }

  // ACK immediately; process the (slow) LLM turn after responding so Meta's
  // delivery doesn't time out and redeliver.
  after(() =>
    processWhatsAppPayload(payload).catch((err) =>
      console.error("[whatsapp webhook] processing failed:", err),
    ),
  );

  return NextResponse.json({ ok: true });
}
