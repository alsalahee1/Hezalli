import QRCode from "qrcode";

// QR code rendered as inline SVG. `qrcode` handles the hard part (byte encoding
// + Reed-Solomon error correction); we draw the resulting module matrix as a
// single SVG path so it prints crisply, scales cleanly, and needs no client JS.
// Server component only — `qrcode` relies on Node APIs.
export function QrCode({
  value,
  size = 120,
  margin = 2,
  className,
}: {
  value: string;
  size?: number;
  /** Quiet-zone width in modules (the QR spec recommends 4; 2 is fine on-screen). */
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
