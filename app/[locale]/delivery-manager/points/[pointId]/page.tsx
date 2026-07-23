import { PointDetailView } from "@/components/ops/point-detail-view";
import { DeliveryGate } from "@/components/auth/delivery-gate";

export default function Page(props: { params: Promise<{ pointId: string }> }) {
  return (
    <DeliveryGate scope="POINTS">
      <PointDetailView base="/delivery-manager" params={props.params} />
    </DeliveryGate>
  );
}
