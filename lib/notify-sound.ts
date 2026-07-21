"use client";

// Two-tone "ping" for new in-app notifications, synthesized on the fly so no
// audio asset is needed. Browsers keep a fresh AudioContext suspended until a
// user gesture, so we resume it on the first click/keypress anywhere on the
// page; playNotifySound() is a no-op until that's happened.
let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

if (typeof window !== "undefined") {
  const unlock = () => {
    getCtx()
      ?.resume()
      .catch(() => {});
  };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
}

export function playNotifySound(): void {
  const c = getCtx();
  if (!c || c.state === "suspended") return;

  const now = c.currentTime;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.15, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
  gain.connect(c.destination);

  [880, 1320].forEach((freq, i) => {
    const osc = c.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    osc.connect(gain);
    const start = now + i * 0.09;
    osc.start(start);
    osc.stop(start + 0.3);
  });
}
