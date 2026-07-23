import { CashExposureView } from "@/components/ops/cash-exposure-view";
import { DeliveryGate } from "@/components/auth/delivery-gate";

export const dynamic = "force-dynamic";

// COD cash exposure — the Settlement desk (money in from drivers & points).
export default function DeliveryManagerCashPage() {
  return (
    <DeliveryGate scope="SETTLEMENT">
      <CashExposureView base="/delivery-manager" />
    </DeliveryGate>
  );
}
