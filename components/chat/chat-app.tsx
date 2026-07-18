"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, CheckCheck, ImageIcon, Send } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { markConversationRead, sendMessage } from "@/lib/actions/chat";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ImageUploader } from "@/components/upload/image-uploader";

type Conversation = {
  id: string;
  otherName: string;
  lastBody: string;
  lastAt: string;
  unread: number;
};
type Msg = {
  id: string;
  senderId: string;
  body: string;
  attachments: unknown;
  readAt: string | null;
  createdAt: string;
};

const POLL_MS = 3500;

export function ChatApp({
  initialConversationId,
}: {
  initialConversationId?: string;
}) {
  const t = useTranslations("Chat");
  const format = useFormatter();
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(
    initialConversationId ?? null,
  );
  const [messages, setMessages] = useState<Msg[]>([]);
  const [me, setMe] = useState<string>("");
  const [text, setText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<string | null>(activeId);
  activeRef.current = activeId;

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/conversations", { cache: "no-store" });
      if (res.ok) setConvs((await res.json()).items);
    } catch {
      /* transient */
    }
  }, []);

  const loadThread = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/chat/thread?id=${id}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { me: string; messages: Msg[] };
      setMe(data.me);
      setMessages(data.messages);
      await markConversationRead(id);
    } catch {
      /* transient */
    }
  }, []);

  // Initial + polling.
  useEffect(() => {
    loadConversations();
    const timer = setInterval(() => {
      loadConversations();
      if (activeRef.current) loadThread(activeRef.current);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [loadConversations, loadThread]);

  // Load thread when a conversation is opened.
  useEffect(() => {
    if (activeId) loadThread(activeId);
    else setMessages([]);
  }, [activeId, loadThread]);

  // Keep scrolled to the newest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const send = async () => {
    if (!activeId || (text.trim() === "" && images.length === 0)) return;
    setSending(true);
    const res = await sendMessage(activeId, text, images);
    setSending(false);
    if (!res.error) {
      setText("");
      setImages([]);
      await loadThread(activeId);
      await loadConversations();
    }
  };

  const active = convs.find((c) => c.id === activeId);

  return (
    <div className="grid h-[70vh] overflow-hidden rounded-lg border md:grid-cols-[280px_1fr]">
      {/* Conversation list */}
      <aside
        className={cn(
          "flex flex-col border-e",
          activeId ? "hidden md:flex" : "flex",
        )}
      >
        <div className="border-b px-4 py-3 font-semibold">{t("title")}</div>
        {convs.length === 0 ? (
          <p className="text-muted-foreground p-4 text-sm">{t("empty")}</p>
        ) : (
          <ul className="flex-1 overflow-y-auto">
            {convs.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setActiveId(c.id)}
                  className={cn(
                    "hover:bg-muted flex w-full flex-col gap-0.5 border-b px-4 py-3 text-start",
                    activeId === c.id && "bg-muted",
                  )}
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="line-clamp-1 font-medium">
                      {c.otherName}
                    </span>
                    {c.unread > 0 ? (
                      <span className="bg-primary text-primary-foreground flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold">
                        {c.unread}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-muted-foreground line-clamp-1 text-xs">
                    {c.lastBody || t("noMessages")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      {/* Thread */}
      <section className={cn("flex flex-col", !activeId && "hidden md:flex")}>
        {!activeId ? (
          <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
            {t("selectConversation")}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 border-b px-4 py-3">
              <button
                type="button"
                onClick={() => setActiveId(null)}
                className="hover:bg-muted rounded-md p-1 md:hidden"
                aria-label={t("back")}
              >
                <ArrowLeft className="size-5 rtl:rotate-180" />
              </button>
              <span className="font-semibold">{active?.otherName}</span>
            </div>

            <div
              ref={scrollRef}
              className="flex-1 space-y-2 overflow-y-auto p-4"
            >
              {messages.map((m) => {
                const mine = m.senderId === me;
                const atts = (m.attachments as string[] | null) ?? [];
                return (
                  <div
                    key={m.id}
                    className={cn(
                      "flex",
                      mine ? "justify-end" : "justify-start",
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[75%] rounded-lg px-3 py-2 text-sm",
                        mine
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted",
                      )}
                    >
                      {atts.length > 0 ? (
                        <div className="mb-1 flex flex-wrap gap-1">
                          {atts.map((url, i) => (
                            <a
                              key={i}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block size-28 overflow-hidden rounded"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={url}
                                alt=""
                                className="size-full object-cover"
                              />
                            </a>
                          ))}
                        </div>
                      ) : null}
                      {m.body ? (
                        <p className="whitespace-pre-wrap">{m.body}</p>
                      ) : null}
                      <span
                        className={cn(
                          "mt-0.5 flex items-center justify-end gap-1 text-[10px]",
                          mine
                            ? "text-primary-foreground/70"
                            : "text-muted-foreground",
                        )}
                      >
                        {format.dateTime(new Date(m.createdAt), {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {mine ? (
                          m.readAt ? (
                            <CheckCheck className="size-3" />
                          ) : (
                            <Check className="size-3" />
                          )
                        ) : null}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Composer */}
            <div className="space-y-2 border-t p-3">
              {images.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {images.map((url) => (
                    <div
                      key={url}
                      className="size-14 overflow-hidden rounded border"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt=""
                        className="size-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="flex items-end gap-2">
                <ImageUploader
                  folder="products"
                  label=""
                  onUploaded={(url) =>
                    setImages((imgs) => [...imgs, url].slice(0, 4))
                  }
                />
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  rows={1}
                  placeholder={t("messagePlaceholder")}
                  className="max-h-24 flex-1 resize-none rounded-md border bg-transparent p-2 text-sm outline-none"
                />
                <Button
                  size="sm"
                  disabled={
                    sending || (text.trim() === "" && images.length === 0)
                  }
                  onClick={send}
                >
                  <Send className="size-4" />
                </Button>
              </div>
              <p className="text-muted-foreground hidden text-[11px] md:block">
                <ImageIcon className="me-1 inline size-3" />
                {t("hint")}
              </p>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
