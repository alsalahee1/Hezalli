# File storage (images)

Hezalli stores uploaded images (avatars, store logos/banners, product photos)
through a small provider-agnostic layer in `lib/storage.ts`. Which backend it
uses is chosen by the `STORAGE_DRIVER` environment variable — **switching
providers is an env change, no code change.**

| Driver | When | Where files live |
|---|---|---|
| `local` (default) | local dev | `.uploads/` on disk, served by `/api/files/*` |
| `s3` | production | any S3-compatible bucket (Cloudflare R2, Supabase Storage, AWS S3, MinIO) |

Uploads go through `POST /api/upload` (auth-required; validates type ≤ 5 MB;
images are downscaled + re-encoded to WebP in the browser first). You never
need a bucket to develop — `local` just works.

---

## Production: Cloudflare R2 (recommended)

R2 is S3-compatible with no egress fees — a good fit for image serving.

1. Create a Cloudflare account → **R2** → **Create bucket** (e.g. `hezalli-uploads`).
2. **Make images publicly readable**: open the bucket → **Settings** →
   **Public access** → either enable the **r2.dev** public URL, or connect a
   custom domain (e.g. `cdn.hezalli.com`). Copy that public base URL.
3. **API token**: R2 → **Manage R2 API Tokens** → **Create API token** with
   **Object Read & Write** for this bucket. Copy the **Access Key ID** and
   **Secret Access Key** (shown once).
4. Find your **Account ID** (R2 overview) → your S3 endpoint is
   `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.
5. Set these env vars (in `.env` locally to test, and in your host — e.g.
   Vercel — for production):

   ```
   STORAGE_DRIVER=s3
   S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
   S3_REGION=auto
   S3_BUCKET=hezalli-uploads
   S3_ACCESS_KEY_ID=<access key id>
   S3_SECRET_ACCESS_KEY=<secret access key>
   S3_PUBLIC_URL=https://<your r2.dev or custom domain>
   ```

No bucket CORS is required — uploads are proxied through the app server, not
sent from the browser to the bucket.

## Alternative: Supabase Storage

Supabase Storage also exposes an S3-compatible endpoint, so the same driver
works:

1. Supabase project → **Storage** → **New bucket** → mark it **Public**.
2. **Project Settings → Storage** → S3 connection: copy the **endpoint** and
   region, and create **S3 access keys**.
3. Set the same `S3_*` vars; `S3_PUBLIC_URL` is the bucket's public URL
   (`https://<project>.supabase.co/storage/v1/object/public/<bucket>`).

---

## Notes

- Files are keyed as `<folder>/<userId>/<random>.<ext>` (`folder` ∈
  `avatars`, `stores`, `products`), namespaced per user for easy attribution.
- `lib/storage.ts` `isOwnStorageUrl()` gates server actions so an image field
  can only be set to a URL that came from our own storage.
- The `local` driver's `.uploads/` directory is git-ignored; it's a dev
  convenience and is not used when `STORAGE_DRIVER=s3`.
