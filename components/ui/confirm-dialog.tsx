"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

type ConfirmOptions = {
  destructive?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
};

/**
 * In-app replacement for `window.confirm()`. The browser's native confirm
 * shows an ugly "site says" chrome dialog that breaks the native-app feel;
 * this renders the same bottom-sheet/centered `Modal` used everywhere else
 * in the app. Usage mirrors `confirm()` closely — just add `await`:
 *
 *   const { confirm, dialog } = useConfirm();
 *   if (!(await confirm(message))) return;
 *   ...
 *   return <>{dialog}<Button onClick={onClick}>...</Button></>;
 */
export function useConfirm() {
  const t = useTranslations("Common");
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [options, setOptions] = useState<ConfirmOptions>({});
  const resolveRef = useRef<(value: boolean) => void>(() => {});

  const confirm = useCallback((msg: string, opts: ConfirmOptions = {}) => {
    setMessage(msg);
    setOptions(opts);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const close = (result: boolean) => {
    setOpen(false);
    resolveRef.current(result);
  };

  const dialog = (
    <Modal open={open} onClose={() => close(false)} closeLabel={t("close")}>
      <p className="pe-6 text-sm text-pretty">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={() => close(false)}>
          {options.cancelLabel ?? t("cancel")}
        </Button>
        <Button
          variant={options.destructive ? "destructive" : "default"}
          onClick={() => close(true)}
        >
          {options.confirmLabel ?? t("confirm")}
        </Button>
      </div>
    </Modal>
  );

  return { confirm, dialog };
}
