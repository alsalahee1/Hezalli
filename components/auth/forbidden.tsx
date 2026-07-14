import { ShieldAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

// Rendered by the seller/admin layouts when a signed-in user lacks the required
// role (server-side authorization check).
export async function Forbidden() {
  const t = await getTranslations("Auth");
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="bg-destructive/10 text-destructive flex size-14 items-center justify-center rounded-full">
        <ShieldAlert className="size-6" />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">
        {t("forbiddenTitle")}
      </h1>
      <p className="text-muted-foreground max-w-md">{t("forbiddenDesc")}</p>
      <Button asChild variant="outline">
        <Link href="/">{t("backHome")}</Link>
      </Button>
    </div>
  );
}
