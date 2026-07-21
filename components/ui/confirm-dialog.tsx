"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useMountTransition } from "@/components/ui/use-mount-transition";

type ConfirmOptions = {
  /** Short question shown in bold, e.g. "Cancel order?" — always pass one. */
  title: string;
  destructive?: boolean;
  /** Specific action word, e.g. "Delete" or "Cancel order" — avoid a bare "OK". */
  confirmLabel?: string;
  cancelLabel?: string;
};

/**
 * In-app replacement for `window.confirm()`. The browser's native confirm
 * shows an ugly "site says" chrome dialog that breaks the native-app feel;
 * this renders a centered alert card (like a native OS confirm dialog, not
 * a bottom sheet — this is a quick yes/no decision, not a form). Usage
 * mirrors `confirm()` closely — just add `await`:
 *
 *   const { confirm, dialog } = useConfirm();
 *   if (!(await confirm(description, { title, confirmLabel }))) return;
 *   ...
 *   return <>{dialog}<Button onClick={onClick}>...</Button></>;
 */
export function useConfirm() {
  const t = useTranslations("Common");
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [options, setOptions] = useState<ConfirmOptions>({ title: "" });
  const resolveRef = useRef<(value: boolean) => void>(() => {});

  const confirm = useCallback((msg: string, opts: ConfirmOptions) => {
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
    <ConfirmOverlay
      open={open}
      title={options.title}
      message={message}
      destructive={options.destructive}
      confirmLabel={options.confirmLabel ?? t("confirm")}
      cancelLabel={options.cancelLabel ?? t("cancel")}
      onCancel={() => close(false)}
      onConfirm={() => close(true)}
    />
  );

  return { confirm, dialog };
}

function ConfirmOverlay({
  open,
  title,
  message,
  destructive,
  confirmLabel,
  cancelLabel,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  message: string;
  destructive?: boolean;
  confirmLabel: string;
  cancelLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { mounted, shown } = useMountTransition(open);

  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [mounted, onCancel]);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div
        className={cn(
          "absolute inset-0 bg-black/50 transition-opacity duration-200 ease-out motion-reduce:transition-none",
          shown ? "opacity-100" : "opacity-0",
        )}
        onClick={onCancel}
        aria-hidden
      />
      <div
        className={cn(
          "bg-background relative z-10 w-full max-w-sm transform-gpu rounded-2xl border p-6 shadow-2xl transition duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform motion-reduce:transition-none",
          shown ? "scale-100 opacity-100" : "scale-95 opacity-0",
        )}
      >
        <h2 id="confirm-dialog-title" className="text-lg font-semibold">
          {title}
        </h2>
        <p className="text-muted-foreground mt-1.5 text-sm text-pretty">
          {message}
        </p>
        <div className="mt-6 flex gap-3">
          <Button
            variant="outline"
            size="lg"
            className="flex-1"
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            size="lg"
            className="flex-1"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
