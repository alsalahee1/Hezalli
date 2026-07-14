import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

// Password hashing for Hezalli credentials auth.
//
// We use Node's built-in scrypt (a memory-hard, OWASP-recommended KDF) instead
// of bcrypt/argon2 so there is no native build dependency and — importantly —
// so the format matches the hashes already written by `prisma/seed.ts`, which
// lets the seeded admin/sellers/buyers sign in. `prisma/seed.ts` imports these
// helpers so the two never drift.
//
// Stored format: `scrypt$<saltHex>$<hashHex>`.
// NOTE: the salt is fed to scrypt as its hex STRING (not decoded bytes); verify
// must derive the same way to stay compatible with previously stored hashes.

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;

  const [, salt, hashHex] = parts;
  const expected = Buffer.from(hashHex, "hex");
  if (expected.length === 0) return false;

  const derived = (await scrypt(password, salt, expected.length)) as Buffer;
  // timingSafeEqual throws on length mismatch, so guard first.
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
