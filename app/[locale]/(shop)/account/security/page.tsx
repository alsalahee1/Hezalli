import { getTranslations } from "next-intl/server";

import { DeleteAccount } from "@/components/account/delete-account";
import { PasswordForm } from "@/components/account/password-form";

export default async function SecurityPage() {
  const t = await getTranslations("Account");
  return (
    <section className="space-y-8">
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{t("changePassword")}</h2>
          <p className="text-muted-foreground text-sm">
            {t("changePasswordDesc")}
          </p>
        </div>
        <PasswordForm />
      </div>

      <div className="space-y-4">
        <h2 className="text-destructive text-lg font-semibold">
          {t("dangerZone")}
        </h2>
        <DeleteAccount />
      </div>
    </section>
  );
}
