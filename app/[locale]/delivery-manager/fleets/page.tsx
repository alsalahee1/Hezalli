import { FleetsView } from "@/components/ops/fleets-view";
import { DeliveryGate } from "@/components/auth/delivery-gate";

export default function Page() {
  return (
    <DeliveryGate scope="FLEET">
      <FleetsView base="/delivery-manager" />
    </DeliveryGate>
  );
}
