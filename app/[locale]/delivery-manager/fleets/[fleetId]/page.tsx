import { FleetDetailView } from "@/components/ops/fleet-detail-view";

export default function Page(props: { params: Promise<{ fleetId: string }> }) {
  return <FleetDetailView base="/delivery-manager" params={props.params} />;
}
