import { getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AvatarUploader } from "@/components/account/avatar-uploader";
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

      <AvatarUploader initialUrl={user?.image ?? null} initial={initial} />

      <ProfileForm
        defaultName={user?.name ?? ""}
        email={user?.email ?? ""}
        defaultPhone={user?.phone ?? ""}
      />
    </section>
  );
}
