"use client";

import QRCode from "qrcode";

// Client-side twin of components/orders/qr-code.tsx. `QRCode.create` returns the
// module matrix (pure JS, browser-safe); we draw it as one inline SVG path so it
// scales crisply with no <img>/canvas. Used where the encoded value is only known
// on the client (e.g. a share link built from window.location.origin).
export function ClientQrCode({
  value,
  size = 180,
  margin = 2,
  className,
}: {
  value: string;
  size?: number;
  margin?: number;
  className?: string;
}) {
  const qr = QRCode.create(value, { errorCorrectionLevel: "M" });
  const count = qr.modules.size;
  const data = qr.modules.data;
  const dim = count + margin * 2;

  let path = "";
  for (let y = 0; y < count; y++) {
    for (let x = 0; x < count; x++) {
      if (data[y * count + x]) path += `M${x + margin},${y + margin}h1v1h-1z`;
    }
  }

  return (
    <svg
      className={className}
      viewBox={`0 0 ${dim} ${dim}`}
      width={size}
      height={size}
      role="img"
      aria-label="QR code"
      shapeRendering="crispEdges"
    >
      <rect width={dim} height={dim} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
