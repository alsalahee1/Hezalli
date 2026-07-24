import { getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { walletHasPin } from "@/lib/wallet-pin";
import { DeleteAccount } from "@/components/account/delete-account";
import { PasswordForm } from "@/components/account/password-form";
import { WalletPinForm } from "@/components/wallet/wallet-pin-form";
import { PasskeyManager } from "@/components/wallet/passkey-manager";

export default async function SecurityPage() {
  const t = await getTranslations("Account");
  const session = await auth();
  const userId = session?.user?.id;

  // Wallet PIN + biometric setup lives here (the account Security page) rather
  // than on the wallet overview, which stays a clean payments screen.
  const [hasPin, passkeys] = userId
    ? await Promise.all([
        walletHasPin(userId),
        prisma.walletCredential.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          select: { id: true, label: true },
        }),
      ])
    : [false, [] as { id: string; label: string | null }[]];

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

      {userId ? (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">{t("biometricSignin")}</h2>
            <p className="text-muted-foreground text-sm">
              {t("biometricSigninDesc")}
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <PasskeyManager passkeys={passkeys} />
          </div>
        </div>
      ) : null}

      {userId ? (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">{t("walletSecurity")}</h2>
            <p className="text-muted-foreground text-sm">
              {t("walletSecurityDesc")}
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <WalletPinForm hasPin={hasPin} />
          </div>
        </div>
      ) : null}

      <div className="space-y-4">
        <h2 className="text-destructive text-lg font-semibold">
          {t("dangerZone")}
        </h2>
        <DeleteAccount />
      </div>
    </section>
  );
}
