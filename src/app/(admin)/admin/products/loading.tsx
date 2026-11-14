import { ListPageSkeleton } from "@/components/skeletons";

export default function Loading() {
  return <ListPageSkeleton title="Products" description={null} headers={["Name", "Category", "Base price", "3D model", "Status"]} rows={6} thumb button />;
}
