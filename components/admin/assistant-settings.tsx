"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { KeyRound, MessageCircle, Mic, Shield, Sparkles } from "lucide-react";

import {
  saveAssistantAvatar,
  saveAssistantKey,
  saveAssistantSettings,
} from "@/lib/actions/settings";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImageUploader } from "@/components/upload/image-uploader";

// Gemini prebuilt TTS voices worth offering; "" = keep the server default.
const VOICES = [
  "Leda",
  "Kore",
  "Aoede",
  "Zephyr",
  "Puck",
  "Charon",
  "Fenrir",
  "Orus",
];
const REPLY_MODES = ["text", "voice", "both", "match"] as const;

export type AssistantCurrent = {
  enabled: boolean;
  avatar: string;
  defaultAvatar: string;
  keySource: "db" | "env" | "none";
  model: string;
  replyMode: string;
  ttsVoice: string;
  ttsStyle: string;
  maxPerHour: number;
  dailyCap: number;
  spendCapUsd: number;
  telegramEnabled: boolean;
  whatsappEnabled: boolean;
  telegramConfigured: boolean;
  whatsappConfigured: boolean;
};

export type AssistantUsage = {
  messagesToday: number;
  effectiveDailyCap: number;
  monthSpendUsd: number;
  effectiveSpendCap: number; // 0 = no cap
  monthMessages: number;
};

export function AssistantSettings({
  current,
  usage,
}: {
  current: AssistantCurrent;
  usage: AssistantUsage;
}) {
  const t = useTranslations("AdminAssistant");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [key, setKey] = useState("");

  const [f, setF] = useState({
    enabled: current.enabled,
    model: current.model,
    replyMode: current.replyMode,
    ttsVoice: current.ttsVoice,
    ttsStyle: current.ttsStyle,
    maxPerHour: String(current.maxPerHour || ""),
    dailyCap: String(current.dailyCap || ""),
    spendCapUsd: String(current.spendCapUsd || ""),
    telegramEnabled: current.telegramEnabled,
    whatsappEnabled: current.whatsappEnabled,
  });
  const set = (k: keyof typeof f, v: string | boolean) => {
    setF((s) => ({ ...s, [k]: v }));
    setDone(false);
  };

  const run = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      setErr(null);
      setDone(false);
      const res = await fn();
      if (res.error) setErr(res.error);
      else {
        setDone(true);
        router.refresh();
      }
    });

  const submit = () =>
    run(() =>
      saveAssistantSettings({
        enabled: f.enabled,
        model: f.model,
        replyMode: f.replyMode,
        ttsVoice: f.ttsVoice,
        ttsStyle: f.ttsStyle,
        maxPerHour: Number(f.maxPerHour) || 0,
        dailyCap: Number(f.dailyCap) || 0,
        spendCapUsd: Number(f.spendCapUsd) || 0,
        telegramEnabled: f.telegramEnabled,
        whatsappEnabled: f.whatsappEnabled,
      }),
    );

  const keyStatus =
    current.keySource === "db"
      ? { text: t("keyStatusDb"), tone: "text-emerald-600" }
      : current.keySource === "env"
        ? { text: t("keyStatusEnv"), tone: "text-muted-foreground" }
        : { text: t("keyStatusNone"), tone: "text-amber-600" };

  return (
    <div className="space-y-6">
      {/* ── Status & identity ── */}
      <section className="space-y-4 rounded-lg border p-5">
        <SectionTitle icon={Sparkles} title={t("statusTitle")} />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={f.enabled}
            onChange={(e) => set("enabled", e.target.checked)}
          />
          {t("enabled")}
          <span className="text-muted-foreground text-xs">
            {t("enabledHint")}
          </span>
        </label>
        <div className="space-y-1.5">
          <span className="text-sm font-medium">{t("avatar")}</span>
          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-muted size-16 shrink-0 overflow-hidden rounded-full border">
              {current.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={current.avatar}
                  alt=""
                  className="size-full object-cover"
                />
              ) : null}
            </div>
            <ImageUploader
              folder="avatars"
              onUploaded={(url) => run(() => saveAssistantAvatar(url))}
            />
            {current.avatar && current.avatar !== current.defaultAvatar ? (
              <Button
                variant="outline"
                onClick={() => run(() => saveAssistantAvatar(null))}
                disabled={pending}
              >
                {t("avatarReset")}
              </Button>
            ) : null}
          </div>
          <span className="text-muted-foreground block text-xs">
            {t("avatarHint")}
          </span>
        </div>
      </section>

      {/* ── Credentials & model ── */}
      <section className="space-y-4 rounded-lg border p-5">
        <SectionTitle icon={KeyRound} title={t("credsTitle")} />
        <p className={`text-sm ${keyStatus.tone}`}>{keyStatus.text}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-sm font-medium">{t("key")}</span>
            <Input
              type="password"
              dir="ltr"
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="AIza…"
            />
            <span className="text-muted-foreground block text-xs">
              {t("keyHint")}
            </span>
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">{t("model")}</span>
            <Input
              dir="ltr"
              value={f.model}
              onChange={(e) => set("model", e.target.value)}
              placeholder="gemini-2.5-flash"
            />
            <span className="text-muted-foreground block text-xs">
              {t("modelHint")}
            </span>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() =>
              run(async () => {
                const res = await saveAssistantKey(key);
                if (!res.error) setKey("");
                return res;
              })
            }
            disabled={pending || !key.trim()}
            variant="outline"
          >
            {t("keySave")}
          </Button>
          {current.keySource === "db" ? (
            <Button
              variant="outline"
              onClick={() => run(() => saveAssistantKey(null))}
              disabled={pending}
            >
              {t("keyRemove")}
            </Button>
          ) : null}
        </div>
      </section>

      {/* ── Channels ── */}
      <section className="space-y-3 rounded-lg border p-5">
        <SectionTitle icon={MessageCircle} title={t("channelsTitle")} />
        <p className="text-muted-foreground text-sm">{t("channelsDesc")}</p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={f.telegramEnabled}
            onChange={(e) => set("telegramEnabled", e.target.checked)}
          />
          {t("telegram")}
          <StatusBadge ok={current.telegramConfigured} t={t} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={f.whatsappEnabled}
            onChange={(e) => set("whatsappEnabled", e.target.checked)}
          />
          {t("whatsapp")}
          <StatusBadge ok={current.whatsappConfigured} t={t} />
        </label>
        <p className="text-muted-foreground text-xs">{t("channelsHint")}</p>
      </section>

      {/* ── Voice replies ── */}
      <section className="space-y-4 rounded-lg border p-5">
        <SectionTitle icon={Mic} title={t("voiceTitle")} />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-sm font-medium">{t("replyMode")}</span>
            <select
              value={f.replyMode}
              onChange={(e) => set("replyMode", e.target.value)}
              className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
            >
              <option value="">{t("useDefault")}</option>
              {REPLY_MODES.map((m) => (
                <option key={m} value={m}>
                  {t(`replyMode_${m}`)}
                </option>
              ))}
            </select>
            <span className="text-muted-foreground block text-xs">
              {t("replyModeHint")}
            </span>
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">{t("voice")}</span>
            <select
              value={f.ttsVoice}
              onChange={(e) => set("ttsVoice", e.target.value)}
              className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
            >
              <option value="">{t("useDefault")}</option>
              {VOICES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
            <span className="text-muted-foreground block text-xs">
              {t("voiceHint")}
            </span>
          </label>
        </div>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{t("style")}</span>
          <textarea
            value={f.ttsStyle}
            onChange={(e) => set("ttsStyle", e.target.value)}
            rows={2}
            maxLength={500}
            placeholder={t("stylePlaceholder")}
            className="border-input w-full rounded-md border bg-transparent px-3 py-2 text-sm"
          />
          <span className="text-muted-foreground block text-xs">
            {t("styleHint")}
          </span>
        </label>
      </section>

      {/* ── Limits & usage ── */}
      <section className="space-y-4 rounded-lg border p-5">
        <SectionTitle icon={Shield} title={t("limitsTitle")} />
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat
            label={t("usageToday")}
            value={`${usage.messagesToday} / ${usage.effectiveDailyCap}`}
          />
          <Stat label={t("usageMonth")} value={String(usage.monthMessages)} />
          <Stat
            label={t("usageSpend")}
            value={
              `$${usage.monthSpendUsd.toFixed(2)}` +
              (usage.effectiveSpendCap > 0
                ? ` / $${usage.effectiveSpendCap.toFixed(2)}`
                : "")
            }
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="space-y-1.5">
            <span className="text-sm font-medium">{t("maxPerHour")}</span>
            <Input
              type="number"
              dir="ltr"
              value={f.maxPerHour}
              onChange={(e) => set("maxPerHour", e.target.value)}
              placeholder="60"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">{t("dailyCap")}</span>
            <Input
              type="number"
              dir="ltr"
              value={f.dailyCap}
              onChange={(e) => set("dailyCap", e.target.value)}
              placeholder="3000"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">{t("spendCap")}</span>
            <Input
              type="number"
              dir="ltr"
              value={f.spendCapUsd}
              onChange={(e) => set("spendCapUsd", e.target.value)}
              placeholder="0"
            />
          </label>
        </div>
        <p className="text-muted-foreground text-xs">{t("limitsHint")}</p>
      </section>

      <div className="flex items-center gap-3">
        <Button onClick={submit} disabled={pending}>
          {pending ? t("saving") : t("save")}
        </Button>
        {done ? (
          <span className="text-sm text-emerald-600">{t("saved")}</span>
        ) : null}
        {err ? (
          <span className="text-destructive text-sm">{t(`err_${err}`)}</span>
        ) : null}
      </div>
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  title,
}: {
  icon: typeof Sparkles;
  title: string;
}) {
  return (
    <h2 className="flex items-center gap-2 font-medium">
      <Icon className="text-primary size-4" />
      {title}
    </h2>
  );
}

function StatusBadge({ ok, t }: { ok: boolean; t: (k: string) => string }) {
  return (
    <span
      className={
        ok
          ? "rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 uppercase"
          : "bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
      }
    >
      {ok ? t("configured") : t("notConfigured")}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/40 rounded-lg border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-sm font-semibold" dir="ltr">
        {value}
      </p>
    </div>
  );
}
