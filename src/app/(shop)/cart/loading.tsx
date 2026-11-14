import { CartSkeleton, ShopStepPageSkeleton } from "@/components/skeletons";

export default function Loading() {
  return <ShopStepPageSkeleton title="Your Cart" current={1}><CartSkeleton /></ShopStepPageSkeleton>;
}
