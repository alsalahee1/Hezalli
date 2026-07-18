"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ReferralLink({
  url,
  copyLabel,
  copiedLabel,
}: {
  url: string;
  copyLabel: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="flex gap-2">
      <Input value={url} readOnly dir="ltr" className="font-mono text-xs" />
      <Button variant="outline" onClick={copy} className="shrink-0">
        {copied ? (
          <>
            <Check className="size-4" /> {copiedLabel}
          </>
        ) : (
          <>
            <Copy className="size-4" /> {copyLabel}
          </>
        )}
      </Button>
    </div>
  );
}
