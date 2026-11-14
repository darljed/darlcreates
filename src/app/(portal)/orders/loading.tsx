import { ListPageSkeleton } from "@/components/skeletons";

export default function Loading() {
  return <ListPageSkeleton title="My orders" description="Track an order, pay for it, or order the same thing again." headers={["Order", "Items", "Total", "Status", "Actions"]} right={[4]} rows={5} />;
}
