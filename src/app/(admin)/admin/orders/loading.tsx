import { ListPageSkeleton } from "@/components/skeletons";

export default function Loading() {
  return <ListPageSkeleton title="Orders" headers={["Order", "Customer", "Items", "Placed", "Total", "Status"]} right={[4]} rows={10} search chips={[52, 104, 96, 104, 92, 88]} />;
}
