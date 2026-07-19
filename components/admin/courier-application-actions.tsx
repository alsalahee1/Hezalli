import { getTranslations } from "next-intl/server";

import { reviewCourierApplication } from "@/lib/actions/courier-application";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Approve / reject controls for one PENDING courier application. Approving
// grants the COURIER role (server-side, admin-gated); an optional note is
// recorded on the decision and in the audit log.
export async function CourierApplicationActions({
  applicationId,
}: {
  applicationId: string;
}) {
  const t = await getTranslations("AdminCouriers");

  return (
    <form
      action={reviewCourierApplication}
      className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3"
    >
      <input type="hidden" name="applicationId" value={applicationId} />
      <Input
        name="reviewNote"
        placeholder={t("notePlaceholder")}
        className="h-8 flex-1 text-xs"
      />
      <Button
        type="submit"
        name="decision"
        value="approve"
        size="sm"
        className="h-8"
      >
        {t("approve")}
      </Button>
      <Button
        type="submit"
        name="decision"
        value="reject"
        size="sm"
        variant="outline"
        className="text-destructive h-8"
      >
        {t("reject")}
      </Button>
    </form>
  );
}
