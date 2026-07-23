import { CourierDetailView } from "@/components/ops/courier-detail-view";
import { DeliveryGate } from "@/components/auth/delivery-gate";

export default function Page(props: {
  params: Promise<{ courierId: string }>;
}) {
  return (
    <DeliveryGate scope="FLEET">
      <CourierDetailView base="/delivery-manager" params={props.params} />
    </DeliveryGate>
  );
}
