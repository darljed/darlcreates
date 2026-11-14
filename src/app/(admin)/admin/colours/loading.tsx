import { FormPageSkeleton } from "@/components/skeletons";

export default function Loading() {
  return <FormPageSkeleton title="Colours" description="The filament colours you have in stock. Only these are offered to customers." panels={1} />;
}
