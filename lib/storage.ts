import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

// Provider-agnostic object storage. The app talks to this interface; the
// driver behind it is chosen by STORAGE_DRIVER:
//   - "local" (default, dev): files under .uploads/, served by /api/files
//   - "s3"   (prod): any S3-compatible bucket (Cloudflare R2, Supabase
//                    Storage, AWS S3, MinIO) via the S3_* env vars.
// Swapping providers is an env change only — see docs/STORAGE.md.

export interface StorageDriver {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
  publicUrl(key: string): string;
}

export const UPLOAD_DIR = path.join(process.cwd(), ".uploads");

class LocalDriver implements StorageDriver {
  async put(key: string, body: Buffer): Promise<void> {
    const dest = path.join(UPLOAD_DIR, key);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, body);
  }
  async delete(key: string): Promise<void> {
    await unlink(path.join(UPLOAD_DIR, key)).catch(() => {});
  }
  publicUrl(key: string): string {
    return `/api/files/${key}`;
  }
}

class S3Driver implements StorageDriver {
  // Imported lazily so the aws-sdk isn't pulled into the local-dev path.
  private clientPromise?: Promise<import("@aws-sdk/client-s3").S3Client>;
  private bucket = process.env.S3_BUCKET ?? "";
  private publicBase = (process.env.S3_PUBLIC_URL ?? "").replace(/\/$/, "");

  private async client() {
    if (!this.clientPromise) {
      this.clientPromise = import("@aws-sdk/client-s3").then(
        ({ S3Client }) =>
          new S3Client({
            endpoint: process.env.S3_ENDPOINT,
            region: process.env.S3_REGION || "auto",
            forcePathStyle: true,
            credentials: {
              accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
              secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
            },
          }),
      );
    }
    return this.clientPromise;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.client();
    await client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async delete(key: string): Promise<void> {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.client();
    await client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  publicUrl(key: string): string {
    return `${this.publicBase}/${key}`;
  }
}

export const storage: StorageDriver =
  process.env.STORAGE_DRIVER === "s3" ? new S3Driver() : new LocalDriver();

// True for URLs that came from our own storage — used to stop a client from
// pointing an image field at an arbitrary external URL via a server action.
export function isOwnStorageUrl(url: string): boolean {
  if (url.startsWith("/api/files/")) return true;
  const base = (process.env.S3_PUBLIC_URL ?? "").replace(/\/$/, "");
  return base.length > 0 && url.startsWith(`${base}/`);
}
