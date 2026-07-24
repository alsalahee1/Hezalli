// Every Hezalli user already carries one personal QR: their wallet "My code",
// which encodes `/pay/u/<userId>` so others can pay them. We reuse that same
// code as an identity token — scanning it to hire someone onto a point's team,
// for example — so a member never has to read out a phone number.
//
// `extractUserId` pulls the raw user id back out of whatever the camera (or a
// pasted box) produced: a full pay URL (…/en/pay/u/<id>), a short "u/<id>", or
// the bare id on its own. Returns null when the value isn't one of ours.
export function extractUserId(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  // Full or partial pay URL: …/pay/u/<id>
  const url = s.match(/\/pay\/u\/([^/?#\s]+)/i);
  if (url) return decodeURIComponent(url[1]);

  // Short form pasted by hand: u/<id>
  const short = s.match(/^u\/([^/?#\s]+)$/i);
  if (short) return decodeURIComponent(short[1]);

  // Bare id: accept the cuid-ish token we mint for users (letters, digits,
  // and the separators ids use) but nothing with a slash/space so a stray URL
  // or free text can't slip through as an id.
  if (/^[A-Za-z0-9_-]{8,}$/.test(s)) return s;

  return null;
}
