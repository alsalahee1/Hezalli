"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { useTranslations } from "next-intl";

import { postDisputeMessage } from "@/lib/actions/dispute";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function DisputeComposer({ disputeId }: { disputeId: string }) {
  const t = useTranslations("AdminDisputes");
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();

  return (
    <div className="flex gap-2">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        placeholder={t("messagePlaceholder")}
        className="flex-1"
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
