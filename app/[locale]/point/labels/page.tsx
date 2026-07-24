import { getTranslations } from "next-intl/server";
import { Tags } from "lucide-react";

import { requireDeliveryPoint } from "@/lib/authz";
import { pointShelfRows } from "@/lib/actions/point-shelves";
import { canManagePoint } from "@/lib/point-access";
import { pointShelfLoads } from "@/lib/point-shelves";
import { QrCode } from "@/components/orders/qr-code";
import { ShelfLabelControls } from "@/components/point/shelf-label-controls";
import { ShelfOccupancy } from "@/components/point/shelf-occupancy";
import { ShelfRegistryToggle } from "@/components/point/shelf-registry-toggle";
import { ShelfZoneEditor } from "@/components/point/shelf-zone-editor";

// Printable shelf-label sheet. Each label is a QR encoding
// "hezalli:shelf:<code>" with the human code beneath it; stick one on every
// bay, then at the counter scan the label to set where parcels go — the scan
// station (point-scan.tsx) recognises the code and stamps it on the next
// receive/return scan, so a shelf code is never typed.
export default async function PointLabelsPage({
  searchParams,
}: {
  searchParams: Promise<{ rows?: string; bays?: string }>;
}) {
  const gate = await requireDeliveryPoint();
  if (!gate) return null;
  const t = await getTranslations("Point");
  const sp = await searchParams;

  // Lettered rows (A, B, …) × numbered bays, clamped to a sane, printable grid.
  const rows = Math.min(12, Math.max(1, Number(sp.rows) || 6));
  const bays = Math.min(20, Math.max(1, Number(sp.bays) || 8));

  // Auto-placement registry status — the toggle/editor are owner/manager only;
  // the occupancy view is for any counter staff.
  const canManage = canManagePoint(gate.access);
  const loads = await pointShelfLoads(gate.pointId);
  const shelfRows = canManage ? await pointShelfRows() : [];
  const registered = loads.length;

  const codes: string[] = [];
  for (let r = 0; r < rows; r++) {
    const letter = String.fromCharCode(65 + r);
    for (let b = 1; b <= bays; b++) codes.push(`${letter}${b}`);
  }

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <Tags className="text-primary size-5" /> {t("labelsTitle")}
        </h1>
        <p className="text-muted-foreground text-sm">{t("labelsSubtitle")}</p>
      </div>

      <ShelfLabelControls rows={rows} bays={bays} />

      {canManage ? (
        <ShelfRegistryToggle rows={rows} bays={bays} registered={registered} />
      ) : null}

      {canManage && shelfRows.length > 0 ? (
        <ShelfZoneEditor rows={shelfRows} />
      ) : null}

      <ShelfOccupancy loads={loads} />

      {/* The sheet — the only thing that reaches the paper. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 print:grid-cols-4 print:gap-2">
        {codes.map((code) => (
          <div
            key={code}
            className="flex break-inside-avoid flex-col items-center gap-1 rounded-lg border p-3 print:border-black/40"
          >
            <QrCode value={`hezalli:shelf:${code}`} size={120} />
            <span className="text-lg font-bold tracking-wide" dir="ltr">
              {code}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
