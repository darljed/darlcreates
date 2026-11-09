"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { moderateReviewAction } from "@/app/(shop)/products/[slug]/review-actions";

export function ReviewModeration({
  reviewId,
  approved,
}: {
  reviewId: string;
  approved: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function set(next: boolean) {
    startTransition(async () => {
      const res = await moderateReviewAction({ reviewId, approved: next });
      if (res.ok) {
        toast.success(next ? "Approved" : "Hidden");
        router.refresh();
      } else toast.error(res.error ?? "Failed");
    });
  }

  return approved ? (
    <Button variant="outline" size="sm" disabled={pending} onClick={() => set(false)}>
      Hide
    </Button>
  ) : (
    <Button
      size="sm"
      className="bg-green-600 text-white hover:bg-green-700"
      disabled={pending}
      onClick={() => set(true)}
    >
      Approve
    </Button>
  );
}
