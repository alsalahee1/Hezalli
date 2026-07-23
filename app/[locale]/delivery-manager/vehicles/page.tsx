import { VehicleCapacityView } from "@/components/ops/vehicle-capacity-view";
import { DeliveryGate } from "@/components/auth/delivery-gate";

export default function Page() {
  return (
    <DeliveryGate scope="FLEET">
      <VehicleCapacityView />
    </DeliveryGate>
  );
}
