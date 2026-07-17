import { getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ProfileForm } from "@/components/account/profile-form";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) return null; // layout redirects unauthenticated users

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true, phone: true, image: true },
  });
  const t = await getTranslations("Account");

  const label = user?.name || user?.email || "?";
  const initial = label.charAt(0).toUpperCase();

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t("profileTitle")}</h2>
        <p className="text-muted-foreground text-sm">{t("profileDesc")}</p>
      </div>

      <div className="flex items-center gap-4">
        {user?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.image}
            alt=""
            className="size-16 rounded-full object-cover"
          />
        ) : (
          <span className="bg-primary text-primary-foreground flex size-16 items-center justify-center rounded-full text-xl font-semibold">
            {initial}
          </span>
        )}
        <p className="text-muted-foreground text-xs">{t("photoSoon")}</p>
      </div>

      <ProfileForm
        defaultName={user?.name ?? ""}
        email={user?.email ?? ""}
        defaultPhone={user?.phone ?? ""}
      />
    </section>
  );
}
