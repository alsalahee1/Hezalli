import { CashExposureView } from "@/components/ops/cash-exposure-view";

export const dynamic = "force-dynamic";

// COD cash exposure for admins (layout gates the role).
export default function AdminCashPage() {
  return <CashExposureView base="/admin" />;
}
