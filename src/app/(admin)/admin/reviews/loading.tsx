import { ListPageSkeleton } from "@/components/skeletons";

export default function Loading() {
  return <ListPageSkeleton title="Reviews" description="Approve a review to show it on the product page." headers={["Product", "Rating", "Review", "Status", "Action"]} right={[4]} rows={6} />;
}
