import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { requireWalletManagerId } from "@/lib/authz";
import { UPLOAD_DIR } from "@/lib/storage";

// Serves files stored by the local storage driver. In production the s3 driver
// returns bucket URLs directly, so this route is used only with the local
// driver — but STORAGE_DRIVER=local is the default, so it must enforce access
// control on sensitive objects itself.
export const runtime = "nodejs";

const CONTENT_TYPE: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

// Folders that hold sensitive objects and must never be served publicly. Keys
// are `<folder>/<uploaderId>/<random>.<ext>` (see app/api/upload/route.ts).
//   - kyc:   regulated identity documents → owner or wallet/admin staff only.
//   - proof: delivery / payment proof photos → any authenticated user (the
//            legitimate viewers span the order's parties, which the path alone
//            can't resolve; the unguessable key remains the cross-user control).
const OWNER_ONLY = new Set(["kyc"]);
const AUTHED_ONLY = new Set(["proof"]);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: parts } = await params;
  const rel = parts.join("/");
  if (rel.includes("..")) {
    return new NextResponse("bad request", { status: 400 });
  }

  const folder = parts[0] ?? "";
  const ownerId = parts[1] ?? "";
  const isOwnerOnly = OWNER_ONLY.has(folder);
  const isPrivate = isOwnerOnly || AUTHED_ONLY.has(folder);

  if (isPrivate) {
    const session = await auth();
    const uid = session?.user?.id;
    if (!uid) return new NextResponse("unauthorized", { status: 401 });
    if (isOwnerOnly && uid !== ownerId) {
      // Non-owners may only read KYC if they are wallet/admin staff (the KYC
      // reviewers). requireWalletManagerId treats ADMIN as a superset.
      const staff = await requireWalletManagerId();
      if (!staff) return new NextResponse("forbidden", { status: 403 });
    }
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
        // Sensitive objects must not be cached by shared/browser caches.
        "Cache-Control": isPrivate
          ? "private, no-store"
          : "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("not found", { status: 404 });
  }
}
