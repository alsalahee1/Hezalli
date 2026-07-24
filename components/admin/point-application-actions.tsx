import { getTranslations } from "next-intl/server";

import { reviewPointApplication } from "@/lib/actions/point-application";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Approve / reject controls for one PENDING delivery-point application.
// Approving grants the DELIVERY_POINT role and creates the point (server-side,
// admin-gated); an optional note is recorded on the decision + audit log.
export async function PointApplicationActions({
  applicationId,
}: {
  applicationId: string;
}) {
  const t = await getTranslations("AdminPoints");

  return (
    <form
      action={reviewPointApplication}
      className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3"
    >
      <input type="hidden" name="applicationId" value={applicationId} />
      <Input
        name="reviewNote"
        placeholder={t("notePlaceholder")}
        className="flex-1 text-xs"
      />
      <Button type="submit" name="decision" value="approve" size="sm">
        {t("approve")}
      </Button>
      <Button
        type="submit"
        name="decision"
        value="reject"
        size="sm"
        variant="outline"
        className="text-destructive"
      >
        {t("reject")}
      </Button>
    </form>
  );
}
