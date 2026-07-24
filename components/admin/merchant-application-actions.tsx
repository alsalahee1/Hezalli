import { getTranslations } from "next-intl/server";

import { reviewMerchantApplication } from "@/lib/actions/merchant-application";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Approve / reject controls for one PENDING merchant application. Approving
// grants the MERCHANT role and creates the profile (server-side, admin-gated);
// an optional note is recorded on the decision + audit log.
export async function MerchantApplicationActions({
  applicationId,
}: {
  applicationId: string;
}) {
  const t = await getTranslations("AdminMerchants");

  return (
    <form
      action={reviewMerchantApplication}
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
