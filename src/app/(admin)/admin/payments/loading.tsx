import { ListPageSkeleton } from "@/components/skeletons";

export default function Loading() {
  return <ListPageSkeleton title="Payment verification" description="Check each reference against your GCash history before approving. Approving moves the order to “paid”." headers={["Order", "Reference", "Declared", "Submitted", "Action"]} right={[4]} rows={6} />;
}
