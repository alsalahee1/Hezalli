import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { renderUrlToPdf } from "@/lib/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Document types this endpoint can render, mapped to their print page path.
// The target page enforces its own ownership check (buyer's order / seller's
// sub-order), and we forward the caller's cookies so it renders as them.
const DOCS: Record<string, (locale: string, id: string) => string> = {
  invoice: (l, id) => `/${l}/invoice/${id}`,
  "packing-slip": (l, id) => `/${l}/packing-slip/${id}`,
  "shipping-label": (l, id) => `/${l}/shipping-label/${id}`,
};

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") ?? "";
  const id = searchParams.get("id") ?? "";
  const locale = searchParams.get("locale") === "en" ? "en" : "ar";
  const build = DOCS[type];
  if (!build || !/^[a-z0-9]+$/i.test(id)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  // Render the internal page over loopback; the app listens on 0.0.0.0:PORT.
  const port = process.env.PORT || "3000";
  const url = `http://127.0.0.1:${port}${build(locale, id)}`;

  try {
    const pdf = await renderUrlToPdf(url, req.headers.get("cookie"));
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${type}-${id.slice(-8)}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("PDF generation failed:", err);
    return NextResponse.json({ error: "pdf_failed" }, { status: 500 });
  }
}
