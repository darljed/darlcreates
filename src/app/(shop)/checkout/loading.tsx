import { CheckoutSkeleton, ShopStepPageSkeleton } from "@/components/skeletons";

export default function Loading() {
  return <ShopStepPageSkeleton title="Checkout" current={2}><CheckoutSkeleton /></ShopStepPageSkeleton>;
}
