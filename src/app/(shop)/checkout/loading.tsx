import { CheckoutSkeleton, ShopStepPageSkeleton } from "@/components/skeletons";

export default function Loading() {
  return <ShopStepPageSkeleton title="Checkout"><CheckoutSkeleton /></ShopStepPageSkeleton>;
}
