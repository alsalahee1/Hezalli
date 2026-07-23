import { PointsView } from "@/components/ops/points-view";
import { DeliveryGate } from "@/components/auth/delivery-gate";

export default function Page() {
  return (
    <DeliveryGate scope="POINTS">
      <PointsView base="/delivery-manager" />
    </DeliveryGate>
  );
}
