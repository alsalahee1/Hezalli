import { CourierDetailView } from "@/components/ops/courier-detail-view";

export default function Page(props: {
  params: Promise<{ courierId: string }>;
}) {
  return <CourierDetailView base="/delivery-manager" params={props.params} />;
}
