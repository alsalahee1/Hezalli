"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { useTranslations } from "next-intl";

import { postDisputeMessage } from "@/lib/actions/dispute";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export function DisputeComposer({ disputeId }: { disputeId: string }) {
  const t = useTranslations("AdminDisputes");
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();

  return (
    <div className="flex gap-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        placeholder={t("messagePlaceholder")}
        className="flex-1 rounded-md border bg-transparent p-2 text-sm outline-none"
      />
      <Button
        size="sm"
        disabled={pending || body.trim().length === 0}
        onClick={() =>
          start(async () => {
            const res = await postDisputeMessage(disputeId, body);
            if (!res.error) {
              setBody("");
              router.refresh();
            }
          })
        }
      >
        <Send className="size-4" /> {t("send")}
      </Button>
    </div>
  );
}
