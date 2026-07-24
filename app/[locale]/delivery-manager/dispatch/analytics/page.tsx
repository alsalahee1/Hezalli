import { DeliveryAnalyticsView } from "@/components/ops/delivery-analytics-view";
import { DeliveryGate } from "@/components/auth/delivery-gate";

export default function Page(props: {
  searchParams: Promise<{ days?: string }>;
}) {
  return (
    <DeliveryGate scope="DISPATCH">
      <DeliveryAnalyticsView
        base="/delivery-manager"
        searchParams={props.searchParams}
      />
    </DeliveryGate>
  );
}
