import { CouriersView } from "@/components/ops/couriers-view";
import { DeliveryGate } from "@/components/auth/delivery-gate";

export default function Page() {
  return (
    <DeliveryGate scope="FLEET">
      <CouriersView base="/delivery-manager" />
    </DeliveryGate>
  );
}
