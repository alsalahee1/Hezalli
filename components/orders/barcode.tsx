// Dependency-free Code 39 barcode, rendered as inline SVG so it prints crisply.
// Code 39 is self-checking, needs no checksum, and encodes 0-9 A-Z and a few
// symbols — enough for carrier tracking numbers and order references. Each
// character is nine elements (five bars, four spaces); "1" = wide, "0" = narrow.
const CODE39: Record<string, string> = {
  "0": "000110100",
  "1": "100100001",
  "2": "001100001",
  "3": "101100000",
  "4": "000110001",
  "5": "100110000",
  "6": "001110000",
  "7": "000100101",
  "8": "100100100",
  "9": "001100100",
  A: "100001001",
  B: "001001001",
  C: "101001000",
  D: "000011001",
  E: "100011000",
  F: "001011000",
  G: "000001101",
  H: "100001100",
  I: "001001100",
  J: "000011100",
  K: "100000011",
  L: "001000011",
  M: "101000010",
  N: "000010011",
  O: "100010010",
  P: "001010010",
  Q: "000000111",
  R: "100000110",
  S: "001000110",
  T: "000010110",
  U: "110000001",
  V: "011000001",
  W: "111000000",
  X: "010010001",
  Y: "110010000",
  Z: "011010000",
  "-": "010000101",
  ".": "110000100",
  " ": "011000100",
  $: "010101000",
  "/": "010100010",
  "+": "010001010",
  "%": "000101010",
  "*": "010010100", // start / stop guard, never part of the payload
};

const NARROW = 2;
const WIDE = 5;
const QUIET = 20; // quiet zone (units) on each side

export function Barcode({
  value,
  height = 56,
  className,
}: {
  value: string;
  height?: number;
  className?: string;
}) {
  // Keep only encodable characters; Code 39 is uppercase-only.
  const clean = value
    .toUpperCase()
    .split("")
    .filter((ch) => ch !== "*" && ch in CODE39)
    .join("");
  const chars = `*${clean}*`.split("");

  const bars: { x: number; w: number }[] = [];
  let x = QUIET;
  chars.forEach((ch, ci) => {
    const pattern = CODE39[ch];
    for (let i = 0; i < pattern.length; i++) {
      const w = pattern[i] === "1" ? WIDE : NARROW;
      // Even indices are bars (drawn), odd indices are spaces (skipped).
      if (i % 2 === 0) bars.push({ x, w });
      x += w;
    }
    // Narrow inter-character gap after every character except the last.
    if (ci < chars.length - 1) x += NARROW;
  });
  const width = x + QUIET;

  return (
    <svg
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      role="img"
      aria-label={`Barcode ${clean}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <rect x={0} y={0} width={width} height={height} fill="#fff" />
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.w} height={height} fill="#000" />
      ))}
    </svg>
  );
}
