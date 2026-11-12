import { ClickerDesignerSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <main className="flex-1">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <ClickerDesignerSkeleton />
      </div>
    </main>
  );
}
