import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { requireWalletManagerId } from "@/lib/authz";
import { isPrivateKey, storage } from "@/lib/storage";

// Serves stored objects. Public assets are served here only by the local
// driver (the s3 driver returns CDN URLs); SENSITIVE objects (kyc/proof) are
// always served here — for BOTH drivers — behind an access check, so they never
// need a public URL. The s3 driver fetches them with credentials, so the bucket
// can stay private for those keys.
export const runtime = "nodejs";

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
  const isOwnerOnly = folder === "kyc"; // regulated ID docs
  const isPrivate = isPrivateKey(rel);

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

  const obj = await storage.getObject(rel);
  if (!obj) return new NextResponse("not found", { status: 404 });

  return new NextResponse(new Uint8Array(obj.body), {
    headers: {
      "Content-Type": obj.contentType,
      // Sensitive objects must not be cached by shared/browser caches.
      "Cache-Control": isPrivate
        ? "private, no-store"
        : "public, max-age=31536000, immutable",
    },
  });
}
