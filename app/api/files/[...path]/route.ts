import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

import { UPLOAD_DIR } from "@/lib/storage";

// Serves files stored by the local storage driver (dev). In production the
// s3 driver returns bucket URLs directly, so this route is unused.
const CONTENT_TYPE: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: parts } = await params;
  const rel = parts.join("/");
  if (rel.includes("..")) {
    return new NextResponse("bad request", { status: 400 });
  }

  const abs = path.join(UPLOAD_DIR, rel);
  // Defense in depth against path traversal.
  if (abs !== UPLOAD_DIR && !abs.startsWith(UPLOAD_DIR + path.sep)) {
    return new NextResponse("bad request", { status: 400 });
  }

  try {
    const buf = await readFile(abs);
    const type =
      CONTENT_TYPE[path.extname(abs).toLowerCase()] ??
      "application/octet-stream";
    return new NextResponse(buf, {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("not found", { status: 404 });
  }
}
