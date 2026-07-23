import { DispatchView } from "@/components/ops/dispatch-view";
import { DeliveryGate } from "@/components/auth/delivery-gate";

export default function Page() {
  return (
    <DeliveryGate scope="DISPATCH">
      <DispatchView base="/delivery-manager" />
    </DeliveryGate>
  );
}
