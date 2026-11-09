"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { submitReviewAction } from "@/app/(shop)/products/[slug]/review-actions";

type Review = { id: string; rating: number; body: string; createdAt: Date };

export function ProductReviews({
  productId,
  slug,
  reviews,
  average,
  count,
}: {
  productId: string;
  slug: string;
  reviews: Review[];
  average: number;
  count: number;
}) {
  const router = useRouter();
  const { data: session } = useSession();
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function submit() {
    startTransition(async () => {
      const res = await submitReviewAction({ productId, slug, rating, body });
      if (res.ok) {
        toast.success("Review submitted — pending approval");
        setBody("");
        setOpen(false);
        router.refresh();
      } else toast.error(res.error ?? "Could not submit");
    });
  }

  return (
    <section className="mt-12 border-t pt-8">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-extrabold">Reviews</h2>
        {session?.user && (
          <Button variant="outline" onClick={() => setOpen((o) => !o)}>
            Write a review
          </Button>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <Stars value={Math.round(average)} />
        <span className="text-sm text-muted-foreground">
          {count > 0 ? `${average.toFixed(1)} · ${count} review${count > 1 ? "s" : ""}` : "No reviews yet"}
        </span>
      </div>

      {open && (
        <div className="mt-4 space-y-3 rounded-xl border-2 border-border bg-card p-4">
          <StarPicker value={rating} onChange={setRating} />
          <Textarea
            rows={3}
            placeholder="Tell others what you think…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <Button
            onClick={submit}
            disabled={pending}
            className="bg-primary text-primary-foreground"
          >
            Submit review
          </Button>
          <p className="text-xs text-muted-foreground">
            Only customers with a delivered order can review. Reviews appear
            after approval.
          </p>
        </div>
      )}

      <div className="mt-6 space-y-4">
        {reviews.map((r) => (
          <div key={r.id} className="rounded-xl border-2 border-border bg-card p-4">
            <Stars value={r.rating} />
            {r.body && <p className="mt-2 text-sm">{r.body}</p>}
            <p className="mt-1 text-xs text-muted-foreground">
              {new Date(r.createdAt).toLocaleDateString("en-PH")}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <div className="flex" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn(
            "size-4",
            n <= value ? "fill-accent text-accent" : "text-muted-foreground/40",
          )}
        />
      ))}
    </div>
  );
}

function StarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${n} stars`}
          onClick={() => onChange(n)}
        >
          <Star
            className={cn(
              "size-7 transition-transform hover:scale-110",
              n <= value ? "fill-accent text-accent" : "text-muted-foreground/40",
            )}
          />
        </button>
      ))}
    </div>
  );
}
