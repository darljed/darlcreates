import { ListPageSkeleton } from "@/components/skeletons";

export default function Loading() {
  return <ListPageSkeleton title="Users" description="Find a customer, fix their details, sign them out or block them." headers={["User", "Status", "Orders", "Spent", "Joined", "Last order"]} right={[2, 3]} rows={10} search />;
}
