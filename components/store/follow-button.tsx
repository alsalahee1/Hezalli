"use client";

import { useState, useTransition } from "react";
import { Heart } from "lucide-react";
import { useTranslations } from "next-intl";

import { toggleFollow } from "@/lib/actions/merchandising";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function FollowButton({
  storeId,
  initialFollowing,
  initialCount,
}: {
  storeId: string;
  initialFollowing: boolean;
  initialCount: number;
}) {
  const t = useTranslations("StorePage");
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [count, setCount] = useState(initialCount);
  const [pending, start] = useTransition();

  return (
    <Button
      variant={following ? "outline" : "default"}
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await toggleFollow(storeId);
          if (res.error === "unauthorized") {
            router.push("/login");
            return;
          }
          if (typeof res.following === "boolean") setFollowing(res.following);
          if (typeof res.count === "number") setCount(res.count);
        })
      }
    >
      <Heart
        className={cn("size-4", following && "fill-current text-rose-500")}
      />
      {following ? t("following") : t("follow")}
      <span className="text-muted-foreground ms-1 text-xs">({count})</span>
    </Button>
  );
}
