import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getCartLines, cartSubtotalCents } from "@/lib/cart";
import { formatPHP } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { CheckoutForm } from "@/components/checkout-form";
import { listAddresses } from "@/lib/addresses";
import { shippingCentsFor } from "@/lib/shipping";

export const metadata = { title: "Checkout" };

export default function CheckoutPage() {
  return (
    <main className="flex-1">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="mb-8 text-3xl font-extrabold">Checkout</h1>
        <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
          <CheckoutContents />
        </Suspense>
      </div>
    </main>
  );
}

async function CheckoutContents() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirect=/checkout");

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
  const shipping = shippingCentsFor(subtotal);
  const total = subtotal + shipping;
  const saved = await listAddresses(user.id);

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_320px]">
      <CheckoutForm saved={saved} defaultName={user.name} />

      <aside className="h-fit rounded-xl border-2 border-border bg-muted/40 p-5">
        <h2 className="mb-3 font-bold">Order summary</h2>
        <ul className="space-y-2 text-sm">
          {lines.map((l) => (
            <li key={l.id} className="flex justify-between gap-2">
              <span className="text-muted-foreground">
                {l.qty}× {l.productName}
              </span>
              <span className="font-medium">{formatPHP(l.lineTotalCents)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 space-y-1 border-t pt-3 text-sm">
          <Row label="Subtotal" value={formatPHP(subtotal)} />
          <Row label="Shipping (flat)" value={formatPHP(shipping)} />
        </div>
        <div className="mt-3 flex justify-between border-t pt-3 text-lg font-extrabold">
          <span>Total</span>
          <span className="text-primary">{formatPHP(total)}</span>
        </div>
      </aside>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
