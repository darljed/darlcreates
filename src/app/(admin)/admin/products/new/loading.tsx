import { FormPageSkeleton } from "@/components/skeletons";

export default function Loading() {
  return <FormPageSkeleton title="New product" description="After creating, you'll add customization options (colors, text, sizes)." panels={1} />;
}
