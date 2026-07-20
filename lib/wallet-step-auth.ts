// Unified wallet step-up authorization (Step 21). Every outflow (send, pay,
// bill, cash-out) calls this to authorize the payment: a biometric passkey
// assertion when supplied, otherwise the wallet PIN. Plain module — the caller
// passes the authenticated user id.
import { verifyWalletPin, type PinResult } from "@/lib/wallet-pin";
import { verifyWalletPasskey } from "@/lib/webauthn";

export type WalletAuth = { pin?: string; passkey?: string };

// Reuses the PIN error vocabulary; passkey failures collapse to "wrongPin" so
// the UI shows a single "couldn't authorize" style message and can offer a retry.
export async function verifyWalletAuth(
  userId: string,
  auth: WalletAuth,
): Promise<PinResult> {
  if (auth.passkey) {
    const res = await verifyWalletPasskey(userId, auth.passkey);
    return res.ok ? { ok: true } : { error: "wrongPin" };
  }
  return verifyWalletPin(userId, auth.pin ?? "");
}
