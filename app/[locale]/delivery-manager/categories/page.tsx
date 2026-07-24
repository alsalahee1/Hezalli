import { CategoryDefaultsView } from "@/components/ops/category-defaults-view";
import { DeliveryGate } from "@/components/auth/delivery-gate";

export default function Page() {
  return (
    <DeliveryGate scope="NETWORK">
      <CategoryDefaultsView />
    </DeliveryGate>
  );
}
