import Image, { type ImageProps } from "next/image";

// A next/image wrapper that is safe for Hezalli's storage model. Same-origin
// images (the local /api/files driver, and any same-origin deployment) are
// optimized by Next; absolute URLs — the S3 public-URL driver in production and
// the picsum seed data — are passed through UN-optimized, so they can never trip
// the build-time `images.remotePatterns` allow-list and 404. Either way the image
// still gains lazy loading, async decoding, and a reserved layout box (no CLS),
// which raw <img> did not provide.
//
// To enable Next's optimizer for S3 images later, allow-list the S3 host in
// next.config.ts (from S3_PUBLIC_URL, available at build time) and this wrapper
// will start optimizing them automatically — no call-site changes needed.
export function SmartImage(props: ImageProps) {
  const external =
    typeof props.src === "string" && /^https?:\/\//i.test(props.src);
  return <Image {...props} unoptimized={external || props.unoptimized} />;
}
