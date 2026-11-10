import { Suspense } from "react";
import Link from "next/link";
import { getCurrentUser, requireUser } from "@/lib/session";
import { getCartLines, cartSubtotalCents } from "@/lib/cart";
import { formatPHP } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { CheckoutSteps } from "@/components/order-progress";
import { CartItemRow } from "@/components/cart-item-row";

export const metadata = { title: "Cart" };

export default function CartPage() {
  return (
    <main className="flex-1">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="mb-4 text-3xl font-extrabold">Your Cart</h1>
        <CheckoutSteps current={1} />
        <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
          <CartContents />
        </Suspense>
      </div>
    </main>
  );
}

async function CartContents() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="rounded-xl border-2 border-dashed p-10 text-center">
        <p className="text-muted-foreground">Sign in to view your cart.</p>
        <Button asChild className="mt-4 bg-primary text-primary-foreground">
          <Link href="/sign-in?redirect=/cart">Sign in</Link>
        </Button>
      </div>
    );
  }

  await requireUser("/cart"); // routes users who haven't accepted the privacy policy to /consent
  const lines = await getCartLines(user.id);
  if (lines.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed p-10 text-center">
        <p className="text-muted-foreground">Your cart is empty.</p>
        <Button asChild className="mt-4 bg-primary text-primary-foreground">
          <Link href="/products">Browse products</Link>
        </Button>
      </div>
    );
  }

  const subtotal = cartSubtotalCents(lines);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {lines.map((line) => (
          <CartItemRow key={line.id} line={line} />
        ))}
      </div>

      <div className="rounded-xl border-2 border-border bg-muted/40 p-5">
        <div className="flex items-center justify-between text-lg">
          <span className="font-semibold">Subtotal</span>
          <span className="font-extrabold text-primary">
            {formatPHP(subtotal)}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Shipping is calculated at checkout.
        </p>
        <Button
          asChild
          size="lg"
          className="mt-4 w-full bg-primary text-primary-foreground"
        >
          <Link href="/checkout">Proceed to checkout</Link>
        </Button>
      </div>
    </div>
  );
}
