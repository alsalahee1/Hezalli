import { CashExposureView } from "@/components/ops/cash-exposure-view";

export const dynamic = "force-dynamic";

// COD cash exposure for the delivery manager (layout gates the role).
export default function DeliveryManagerCashPage() {
  return <CashExposureView base="/delivery-manager" />;
}
