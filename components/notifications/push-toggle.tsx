"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { useTranslations } from "next-intl";

// Lets a signed-in user opt into Web Push so events (money received, new
// orders, chat messages, delivery updates, ...) reach their device even when
// the tab is closed. Renders nothing when push isn't configured on the
// server (no VAPID key) or the browser can't do push.
export function PushToggle() {
  const t = useTranslations("Push");
  const [supported, setSupported] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    if (!ok) return;

    (async () => {
      // Server key present? (204 = push disabled on the server.)
      const res = await fetch("/api/push/public-key");
      if (res.status !== 200) return;
      const { key } = (await res.json()) as { key: string };
      setSupported(true);
      setPublicKey(key);
      setBlocked(Notification.permission === "denied");
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        setOn(Boolean(sub));
      } catch {
        /* ignore */
      }
    })();
  }, []);

  async function enable() {
    if (!publicKey) return;
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setBlocked(perm === "denied");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
      if (res.ok) setOn(true);
    } catch {
      /* leave off */
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setOn(false);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }

  if (!supported) return null;

  return (
    <button
      type="button"
      disabled={busy || blocked}
      onClick={on ? disable : enable}
      className="flex w-full items-center justify-between gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium disabled:opacity-60"
    >
      <span className="flex items-center gap-2">
        {on ? (
          <BellRing className="text-primary size-4" />
        ) : blocked ? (
          <BellOff className="text-muted-foreground size-4" />
        ) : (
          <Bell className="text-muted-foreground size-4" />
        )}
        {blocked ? t("notifBlocked") : on ? t("notifOn") : t("enableNotif")}
      </span>
      {!blocked ? (
        <span className="text-muted-foreground text-xs">
          {on ? t("notifTapOff") : t("notifTapOn")}
        </span>
      ) : null}
    </button>
  );
}

// VAPID keys are URL-safe base64; the Push API wants a Uint8Array over a plain
// ArrayBuffer (explicit backing so the type is a BufferSource, not a maybe-
// SharedArrayBuffer view).
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
