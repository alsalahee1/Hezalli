"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  KeyRound,
  MessageCircle,
  Mic,
  Send,
  Shield,
  Users,
  Wand2,
} from "lucide-react";

import {
  connectTelegram,
  saveAssistantAvatar,
  saveAssistantKey,
  saveAssistantSettings,
  saveDefaultBot,
  sendTestDigest,
} from "@/lib/actions/settings";
import type { BotId } from "@/lib/ai/bot-constants";
import { cn } from "@/lib/utils";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImageUploader } from "@/components/upload/image-uploader";
import { ShadiIcon } from "@/components/ai/shadi-icon";

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

export type BotCard = {
  id: string;
  name: string;
  avatar: string;
  defaultAvatar: string;
  persona: string;
  greeting: string;
};

export type AssistantCurrent = {
  enabled: boolean;
  bots: BotCard[];
  defaultBot: string;
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
  telegramSource: "db" | "env" | "none";
  telegramUsername: string;
  whatsappConfigured: boolean;
  digestEnabled: boolean;
  digestChatId: string;
  intro: string;
  defaultIntro: string;
  lockedRules: string;
  temperature: number;
  maxTokens: number;
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
  const [tgToken, setTgToken] = useState("");

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
    digestEnabled: current.digestEnabled,
    digestChatId: current.digestChatId,
    defaultBot: current.defaultBot,
    // Show the effective intro so it's editable in place; empty override means
    // "use the default", so seed the box with the default text.
    intro: current.intro || current.defaultIntro,
    // Per-character persona/greeting keyed by bot id.
    personas: Object.fromEntries(
      current.bots.map((b) => [b.id, b.persona]),
    ) as Record<string, string>,
    greetings: Object.fromEntries(
      current.bots.map((b) => [b.id, b.greeting]),
    ) as Record<string, string>,
    temperature: String(current.temperature),
    maxTokens: String(current.maxTokens),
  });
  const set = (k: keyof typeof f, v: string | boolean) => {
    setF((s) => ({ ...s, [k]: v }));
    setDone(false);
  };
  const setBotText = (
    field: "personas" | "greetings",
    botId: string,
    v: string,
  ) => {
    setF((s) => ({ ...s, [field]: { ...s[field], [botId]: v } }));
    setDone(false);
  };

  // Which character's tab is open (image + persona + greeting live per bot).
  const [tab, setTab] = useState<string>(
    current.bots.some((b) => b.id === current.defaultBot)
      ? current.defaultBot
      : (current.bots[0]?.id ?? "shadi"),
  );
  const activeBotCard =
    current.bots.find((b) => b.id === tab) ?? current.bots[0];

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
        intro: f.intro,
        personas: f.personas,
        greetings: f.greetings,
        temperature: Number(f.temperature),
        maxTokens: Number(f.maxTokens),
        telegramEnabled: f.telegramEnabled,
        whatsappEnabled: f.whatsappEnabled,
        digestEnabled: f.digestEnabled,
        digestChatId: f.digestChatId,
        defaultBot: f.defaultBot,
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
        <SectionTitle icon={ShadiIcon} title={t("statusTitle")} />
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
      </section>

      {/* ── Characters (tabbed): each bot's image, default, persona, greeting ── */}
      <section className="space-y-4 rounded-lg border p-5">
        <SectionTitle icon={Users} title={t("charactersTitle")} />
        {/* Shadi / Jumana tabs — a real tab bar: the active one sits on a
            bottom border so the panel below reads as that tab's own page. */}
        <div role="tablist" className="-mb-px flex gap-1 border-b">
          {current.bots.map((bot) => (
            <button
              key={bot.id}
              type="button"
              role="tab"
              aria-selected={tab === bot.id}
              onClick={() => setTab(bot.id)}
              className={cn(
                "flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                tab === bot.id
                  ? "border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground border-transparent",
              )}
            >
              <span className="bg-muted size-6 shrink-0 overflow-hidden rounded-full border">
                {bot.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={bot.avatar}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : null}
              </span>
              {bot.name}
              {f.defaultBot === bot.id ? (
                <span className="text-xs" title={t("isDefault")}>
                  ★
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {activeBotCard ? (
          <div className="space-y-4">
            {/* Image */}
            <div className="space-y-1.5">
              <span className="text-sm font-medium">{t("avatar")}</span>
              <div className="flex flex-wrap items-center gap-3">
                <div className="bg-muted size-16 shrink-0 overflow-hidden rounded-full border">
                  {activeBotCard.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={activeBotCard.avatar}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : null}
                </div>
                <ImageUploader
                  folder="avatars"
                  onUploaded={(url) =>
                    run(() =>
                      saveAssistantAvatar(activeBotCard.id as BotId, url),
                    )
                  }
                />
                {activeBotCard.avatar &&
                activeBotCard.avatar !== activeBotCard.defaultAvatar ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        saveAssistantAvatar(activeBotCard.id as BotId, null),
                      )
                    }
                  >
                    {t("avatarReset")}
                  </Button>
                ) : null}
              </div>
              <span className="text-muted-foreground block text-xs">
                {t("avatarHint")}
              </span>
            </div>

            {/* Default character — persists on click (its own action) so the
                choice sticks without waiting for the form's Save button. */}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="defaultBot"
                className="size-4"
                disabled={pending}
                checked={f.defaultBot === activeBotCard.id}
                onChange={() => {
                  set("defaultBot", activeBotCard.id);
                  run(() => saveDefaultBot(activeBotCard.id as BotId));
                }}
              />
              {f.defaultBot === activeBotCard.id
                ? t("isDefault")
                : t("makeDefault")}
              <span className="text-muted-foreground text-xs">
                {t("defaultHint")}
              </span>
            </label>

            {/* Persona (role) */}
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">{t("persona")}</span>
              <textarea
                value={f.personas[activeBotCard.id] ?? ""}
                onChange={(e) =>
                  setBotText("personas", activeBotCard.id, e.target.value)
                }
                rows={5}
                maxLength={4000}
                placeholder={t("personaPlaceholder")}
                className="border-input w-full rounded-md border bg-transparent px-3 py-2 text-sm"
              />
              <span className="text-muted-foreground block text-xs">
                {t("personaHint")}
              </span>
            </label>

            {/* Greeting */}
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">{t("greeting")}</span>
              <textarea
                value={f.greetings[activeBotCard.id] ?? ""}
                onChange={(e) =>
                  setBotText("greetings", activeBotCard.id, e.target.value)
                }
                rows={2}
                maxLength={600}
                placeholder={t("greetingPlaceholder")}
                className="border-input w-full rounded-md border bg-transparent px-3 py-2 text-sm"
              />
              <span className="text-muted-foreground block text-xs">
                {t("greetingHint")}
              </span>
            </label>
          </div>
        ) : null}
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

      {/* ── Shared behaviour: base prompt + creativity/length (both bots) ── */}
      <section className="space-y-4 rounded-lg border p-5">
        <SectionTitle icon={Wand2} title={t("behaviourTitle")} />
        <p className="text-muted-foreground text-sm">{t("behaviourDesc")}</p>

        {/* Base intro — the editable half of "Layer 1". */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">{t("intro")}</span>
            {f.intro.trim() !== current.defaultIntro.trim() ? (
              <button
                type="button"
                onClick={() => set("intro", current.defaultIntro)}
                className="text-primary text-xs hover:underline"
              >
                {t("introReset")}
              </button>
            ) : null}
          </div>
          <textarea
            value={f.intro}
            onChange={(e) => set("intro", e.target.value)}
            rows={5}
            maxLength={2000}
            className="border-input w-full rounded-md border bg-transparent px-3 py-2 text-sm"
          />
          <span className="text-muted-foreground block text-xs">
            {t("introHint")}
          </span>
        </div>

        {/* Locked rules — read-only, always applied. */}
        <details className="rounded-md border">
          <summary className="text-muted-foreground cursor-pointer px-3 py-2 text-sm font-medium">
            {t("lockedTitle")}
          </summary>
          <div className="space-y-2 border-t px-3 py-2">
            <p className="text-muted-foreground text-xs">{t("lockedHint")}</p>
            <pre className="bg-muted/40 text-muted-foreground max-h-56 overflow-auto rounded-md p-3 text-xs whitespace-pre-wrap">
              {current.lockedRules}
            </pre>
          </div>
        </details>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-sm font-medium">
              {t("temperature")}: {f.temperature}
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={f.temperature}
              onChange={(e) => set("temperature", e.target.value)}
              className="accent-primary w-full"
            />
            <span className="text-muted-foreground block text-xs">
              {t("temperatureHint")}
            </span>
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">{t("maxTokens")}</span>
            <Input
              type="number"
              dir="ltr"
              value={f.maxTokens}
              onChange={(e) => set("maxTokens", e.target.value)}
              placeholder="1024"
            />
            <span className="text-muted-foreground block text-xs">
              {t("maxTokensHint")}
            </span>
          </label>
        </div>
      </section>

      {/* ── Channels ── */}
      <section className="space-y-3 rounded-lg border p-5">
        <SectionTitle icon={MessageCircle} title={t("channelsTitle")} />
        <p className="text-muted-foreground text-sm">{t("channelsDesc")}</p>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={f.telegramEnabled}
              onChange={(e) => set("telegramEnabled", e.target.checked)}
            />
            {t("telegram")}
            <StatusBadge ok={current.telegramSource !== "none"} t={t} />
            {current.telegramSource === "db" && current.telegramUsername ? (
              <span className="text-muted-foreground text-xs" dir="ltr">
                @{current.telegramUsername}
              </span>
            ) : null}
          </label>
          {current.telegramSource === "db" ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => run(() => connectTelegram(null))}
              disabled={pending}
            >
              {t("tgDisconnect")}
            </Button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="password"
                dir="ltr"
                autoComplete="off"
                value={tgToken}
                onChange={(e) => setTgToken(e.target.value)}
                placeholder="123456789:AA…"
                className="max-w-xs"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  run(async () => {
                    const res = await connectTelegram(tgToken);
                    if (!res.error) setTgToken("");
                    return res;
                  })
                }
                disabled={pending || !tgToken.trim()}
              >
                {t("tgConnect")}
              </Button>
              <span className="text-muted-foreground block w-full text-xs">
                {t("tgTokenHint")}
              </span>
            </div>
          )}
        </div>
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

      {/* ── Weekly digest ── */}
      <section className="space-y-3 rounded-lg border p-5">
        <SectionTitle icon={Send} title={t("digestTitle")} />
        <p className="text-muted-foreground text-sm">{t("digestDesc")}</p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={f.digestEnabled}
            onChange={(e) => set("digestEnabled", e.target.checked)}
          />
          {t("digestEnabled")}
        </label>
        <label className="block max-w-xs space-y-1.5">
          <span className="text-sm font-medium">{t("digestChatId")}</span>
          <Input
            dir="ltr"
            value={f.digestChatId}
            onChange={(e) => set("digestChatId", e.target.value)}
            placeholder="6533994486"
          />
          <span className="text-muted-foreground block text-xs">
            {t("digestChatIdHint")}
          </span>
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={pending || !f.digestChatId.trim()}
            onClick={() =>
              run(async () => {
                const res = await sendTestDigest();
                return res;
              })
            }
          >
            {t("digestTest")}
          </Button>
          <span className="text-muted-foreground text-xs">
            {t("digestTestHint")}
          </span>
        </div>
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
  icon: React.ComponentType<{ className?: string }>;
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
