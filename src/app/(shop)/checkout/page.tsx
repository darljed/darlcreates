import { NOINDEX } from "@/lib/seo";
import { Suspense } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getCartLines, cartSubtotalCents } from "@/lib/cart";
import { Button } from "@/components/ui/button";
import { CheckoutSteps } from "@/components/order-progress";
import { CheckoutForm, type CheckoutAddress } from "@/components/checkout-form";
import { CheckoutSkeleton } from "@/components/skeletons";
import { listAddresses, type SavedAddress } from "@/lib/addresses";
import { getShippingConfig } from "@/lib/site-content";
import { shippingItems } from "@/lib/shipping-server";
import { guessLocation } from "@/lib/psgc-server";

export const metadata = { title: "Checkout", ...NOINDEX };

export default function CheckoutPage() {
  return (
    <main className="flex-1">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="mb-4 text-3xl font-extrabold">Checkout</h1>
        <CheckoutSteps current={2} />
        <Suspense fallback={<CheckoutSkeleton />}>
          <CheckoutContents />
        </Suspense>
      </div>
    </main>
  );
}

async function CheckoutContents() {
  const user = await requireUser("/checkout");

  const [lines, saved] = await Promise.all([getCartLines(user.id), listAddresses(user.id)]);
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
  const [shippingConfig, items, addresses] = await Promise.all([
    getShippingConfig(),
    shippingItems(lines.map((l) => ({ productId: l.productId, qty: l.qty }))),
    Promise.all(saved.map(withLocation)),
  ]);

  return (
    <CheckoutForm
      saved={addresses}
      defaultName={user.name}
      lines={lines.map((l) => ({ id: l.id, productName: l.productName, qty: l.qty, lineTotalCents: l.lineTotalCents }))}
      subtotalCents={subtotal}
      shippingConfig={shippingConfig}
      shippingItems={items}
    />
  );
}

/** The location for a saved address: its own codes, or (older addresses) a guess that is used only when it is exact. */
async function withLocation(a: SavedAddress): Promise<CheckoutAddress> {
  if (a.provinceCode && a.cityCode && a.barangayCode) {
    return { ...a, location: { provinceCode: a.provinceCode, cityCode: a.cityCode, barangayCode: a.barangayCode }, guessed: false };
  }
  const g = await guessLocation({ province: a.province, city: a.city, barangay: a.barangay });
  return { ...a, location: g ?? { provinceCode: "", cityCode: "", barangayCode: "" }, guessed: Boolean(g) };
}
