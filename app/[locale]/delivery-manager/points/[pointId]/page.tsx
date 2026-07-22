import { PointDetailView } from "@/components/ops/point-detail-view";

export default function Page(props: { params: Promise<{ pointId: string }> }) {
  return <PointDetailView base="/delivery-manager" params={props.params} />;
}
