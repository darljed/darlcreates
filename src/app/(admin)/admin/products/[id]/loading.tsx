import { FormPageSkeleton, InlineBone } from "@/components/skeletons";

export default function Loading() {
  return <FormPageSkeleton title={<InlineBone className="h-6 w-56" />} panels={3} />;
}
