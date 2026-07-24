import { FleetDetailView } from "@/components/ops/fleet-detail-view";
import { DeliveryGate } from "@/components/auth/delivery-gate";

export default function Page(props: { params: Promise<{ fleetId: string }> }) {
  return (
    <DeliveryGate scope="FLEET">
      <FleetDetailView base="/delivery-manager" params={props.params} />
    </DeliveryGate>
  );
}
