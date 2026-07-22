import { DeliveryAnalyticsView } from "@/components/ops/delivery-analytics-view";

export default function Page(props: {
  searchParams: Promise<{ days?: string }>;
}) {
  return (
    <DeliveryAnalyticsView
      base="/delivery-manager"
      searchParams={props.searchParams}
    />
  );
}
