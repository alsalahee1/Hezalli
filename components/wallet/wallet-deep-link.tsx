"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

import {
  WALLET_OPEN_SEND,
  WALLET_OPEN_TOPUP,
} from "@/components/wallet/wallet-tab-bar";

// When the wallet home is opened with ?open=topup|send — e.g. from the Top up /
// Send tabs on the history screen, which can't open those forms directly — fire
// the same event the on-page buttons use, then strip the query so a refresh
// doesn't reopen it. Rendered last on the page so the forms' listeners are
// already attached when this runs.
export function WalletDeepLink() {
  const params = useSearchParams();
  const open = params.get("open");

  useEffect(() => {
    if (open !== "topup" && open !== "send") return;
    window.dispatchEvent(
      new CustomEvent(open === "topup" ? WALLET_OPEN_TOPUP : WALLET_OPEN_SEND),
    );
    // Clean the URL without a re-render (avoids retriggering this effect).
    window.history.replaceState(null, "", window.location.pathname);
  }, [open]);

  return null;
}
