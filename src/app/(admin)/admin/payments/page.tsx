import Link from "next/link";
import { adminPendingPayments } from "@/lib/admin";
import { formatPHP } from "@/lib/money";
import { PaymentActions } from "@/components/admin/payment-actions";

export const metadata = { title: "Payments · Admin" };

// Admin pages are per-request and RBAC-gated; they may block on navigation.
// (A layout's `instant = false` does not cover its child pages.)
export const instant = false;

export default async function AdminPaymentsPage() {
  const pending = await adminPendingPayments();

  return (
    <div>
      <h1 className="mb-6 text-3xl font-extrabold">Payment verification</h1>
      {pending.length === 0 ? (
        <p className="text-muted-foreground">No payments awaiting verification.</p>
      ) : (
        <div className="space-y-4">
          {pending.map((p) => (
            <div
              key={p.paymentId}
              className="flex flex-wrap items-center justify-between gap-4 rounded-xl border-2 border-border bg-card p-4"
            >
              <div>
                <Link
                  href={`/admin/orders/${p.orderId}`}
                  className="font-bold hover:text-primary"
                >
                  {p.orderNo}
                </Link>
                <p className="text-sm text-muted-foreground">
                  Ref{" "}
                  <span className="font-mono text-foreground">
                    {p.reference}
                  </span>{" "}
                  · declared {formatPHP(p.amountCents)} ·{" "}
                  {p.submittedAt.toLocaleString("en-PH")}
                </p>
              </div>
              <PaymentActions paymentId={p.paymentId} />
            </div>
          ))}
        </div>
      )}
      <p className="mt-6 text-xs text-muted-foreground">
        Verify a reference against your GCash transaction history before
        approving. Approving advances the order to “paid”.
      </p>
    </div>
  );
}
