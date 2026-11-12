import { CartSkeleton, ShopStepPageSkeleton } from "@/components/skeletons";

export default function Loading() {
  return <ShopStepPageSkeleton title="Your Cart"><CartSkeleton /></ShopStepPageSkeleton>;
}
