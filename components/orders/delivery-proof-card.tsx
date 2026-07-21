import { getFormatter, getTranslations } from "next-intl/server";
import { BadgeCheck, CircleUserRound, PackageCheck } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";

// Shows the proof captured when a courier delivered a parcel — recipient name,
// whether the buyer's delivery code was verified, and the doorstep photo. Used
// on the seller and admin order screens as evidence for COD / delivery
// disputes. Self-queries the latest DELIVERED attempt; renders nothing when
// there's no shipment or no proof was captured.
export async function DeliveryProofCard({
  shipmentId,
}: {
  shipmentId?: string | null;
}) {
  if (!shipmentId) return null;

  const proof = await prisma.deliveryAttempt.findFirst({
    where: { shipmentId, outcome: "DELIVERED" },
    orderBy: { createdAt: "desc" },
    select: {
      recipientName: true,
      proofPhotoKey: true,
      codeVerified: true,
      note: true,
      createdAt: true,
    },
  });
  // Nothing worth showing unless the courier captured at least one signal.
  if (
    !proof ||
    (!proof.recipientName && !proof.proofPhotoKey && !proof.codeVerified)
  ) {
    return null;
  }

  const t = await getTranslations("DeliveryProof");
  const format = await getFormatter();

  return (
    <div className="rounded-xl border p-4">
      <div className="mb-3 flex items-center gap-2">
        <PackageCheck className="size-4 text-emerald-600" />
        <h3 className="text-sm font-semibold">{t("title")}</h3>
        <span className="text-muted-foreground ms-auto text-xs">
          {format.dateTime(proof.createdAt, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </span>
      </div>

      <div className="space-y-2 text-sm">
        {proof.recipientName ? (
          <p className="flex items-center gap-2">
            <CircleUserRound className="text-muted-foreground size-4" />
            <span className="text-muted-foreground">{t("recipient")}:</span>
            <span className="font-medium">{proof.recipientName}</span>
          </p>
        ) : null}

        {proof.codeVerified ? (
          <p className="flex items-center gap-2 text-emerald-600">
            <BadgeCheck className="size-4" />
            <span className="font-medium">{t("codeVerified")}</span>
          </p>
        ) : null}

        {proof.note ? (
          <p className="text-muted-foreground">{proof.note}</p>
        ) : null}

        {proof.proofPhotoKey ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={storage.publicUrl(proof.proofPhotoKey)}
            alt={t("photoAlt")}
            className="mt-1 max-h-64 w-full rounded-lg object-cover"
          />
        ) : null}
      </div>
    </div>
  );
}
