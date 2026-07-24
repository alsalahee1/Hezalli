import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MapPin, Store } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { auth } from "@/auth";
import { bookableSlots, myQueueEntry } from "@/lib/point-queue";
import { prisma } from "@/lib/prisma";
import { QueueCheckin } from "@/components/point/queue-checkin";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Point");
  return { title: t("queueTitle") };
}

// Public self-service arrival page for a hub (docs §44): a seller or driver
// books a drop-off/collection slot or checks in on arrival, and watches their
// place in line — instead of everyone showing up at open.
export default async function PointQueuePublicPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Point");

  const point = await prisma.deliveryPoint.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      city: true,
      governorate: true,
      status: true,
    },
  });
  if (!point || point.status !== "ACTIVE") notFound();

  const session = await auth();
  const userId = session?.user?.id ?? null;

  const [dropoff, collection, mine] = await Promise.all([
    bookableSlots(point.id, "DROPOFF"),
    bookableSlots(point.id, "COLLECTION"),
    userId ? myQueueEntry(userId, point.id) : Promise.resolve(null),
  ]);

  // Both lanes share the hub's open/closed status; only the slot counts differ.
  const status = dropoff.open ? "open" : dropoff.reason;
  const slim = (a: typeof dropoff) =>
    a.open
      ? a.slots.map((s) => ({
          start: s.start,
          label: s.label,
          full: s.full,
          past: s.past,
        }))
      : [];

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <div className="mb-6 space-y-1 text-center">
        <h1 className="flex items-center justify-center gap-1.5 text-2xl font-bold tracking-tight">
          <Store className="text-muted-foreground size-5" /> {point.name}
        </h1>
        <p className="text-muted-foreground flex items-center justify-center gap-1 text-sm">
          <MapPin className="size-3.5" /> {point.city}, {point.governorate}
        </p>
        <p className="text-muted-foreground text-sm text-pretty">
          {t("queueSubtitle")}
        </p>
      </div>

      <QueueCheckin
        pointId={point.id}
        signedIn={!!userId}
        status={status}
        dropoffSlots={slim(dropoff)}
        collectionSlots={slim(collection)}
        myEntry={mine}
      />
    </main>
  );
}
