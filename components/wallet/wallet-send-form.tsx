"use client";

import { useEffect, useState, useTransition } from "react";
import { Send } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { sendWalletFunds } from "@/lib/actions/wallet-p2p";
import { formatUsd } from "@/lib/products";
import { useRouter } from "@/i18n/navigation";
import { WALLET_OPEN_SEND } from "@/components/wallet/wallet-tab-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { WalletAuthField } from "@/components/wallet/wallet-auth-field";
import type { WalletAuth } from "@/lib/wallet-step-auth";

export function WalletSendForm({
  balance,
  hasPin,
  hasPasskey,
}: {
  balance: number;
  hasPin: boolean;
  hasPasskey: boolean;
}) {
  const t = useTranslations("Wallet");
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  // Opened from the wallet bottom bar via a window event.
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(WALLET_OPEN_SEND, onOpen);
    return () => window.removeEventListener(WALLET_OPEN_SEND, onOpen);
  }, []);

  const run = (auth: WalletAuth) =>
    start(async () => {
      setErr(null);
      const res = await sendWalletFunds({
        recipient,
        amountUsd: Number(amount),
        note: note || undefined,
        ...auth,
      });
      if (res.error) setErr(res.error);
      else {
        setOpen(false);
        setRecipient("");
        setAmount("");
        setNote("");
        router.refresh();
      }
    });

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Send className="size-4" /> {t("send")}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        closeLabel={t("cancel")}
      >
        <div className="space-y-3">
          <div>
            <h3 className="font-medium">{t("sendTitle")}</h3>
            <p className="text-muted-foreground text-sm">{t("sendDesc")}</p>
          </div>

          <Input
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder={t("sendRecipient")}
            dir="ltr"
          />
          <Input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={t("sendAmount", {
              balance: formatUsd(balance, locale),
            })}
            dir="ltr"
            className="sm:w-56"
          />
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("sendNote")}
          />
          <WalletAuthField
            hasPin={hasPin}
            hasPasskey={hasPasskey}
            disabled={!recipient || !amount}
            pending={pending}
            error={err}
            submitLabel={t("sendSubmit")}
            onAuthorize={run}
          />
        </div>
      </Modal>
    </>
  );
}
