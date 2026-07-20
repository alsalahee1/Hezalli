import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { storage } from "@/lib/storage";

// Needs the Node.js runtime: uses node:crypto, Buffer, and (for the local
// driver) node:fs — none of which exist on the Edge runtime.
export const runtime = "nodejs";

// Authenticated image upload. Bytes are proxied through the server (simple,
// no bucket CORS needed) and stored via the active storage driver.
const FOLDERS = new Set(["avatars", "stores", "products", "banners", "proof"]);
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB (images are compressed client-side)
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  const folder = String(form.get("folder") ?? "");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }
  if (!FOLDERS.has(folder)) {
    return NextResponse.json({ error: "bad_folder" }, { status: 400 });
  }
  const ext = EXT[file.type];
  if (!ext) {
    return NextResponse.json({ error: "unsupported_type" }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  // Namespaced by user so uploads are easy to attribute and clean up.
  const key = `${folder}/${session.user.id}/${randomBytes(12).toString("hex")}.${ext}`;

  // A storage failure (misconfigured bucket, read-only filesystem, network,
  // bad credentials) must not surface as an opaque 500 — log the real cause
  // for operators and return a structured error the client can explain.
  try {
    await storage.put(key, buf, file.type);
  } catch (err) {
    console.error("[upload] storage.put failed", {
      key,
      driver: process.env.STORAGE_DRIVER ?? "local",
      error: err instanceof Error ? err.message : err,
    });
    return NextResponse.json({ error: "storage_failed" }, { status: 500 });
  }

  return NextResponse.json({ url: storage.publicUrl(key), key });
}
