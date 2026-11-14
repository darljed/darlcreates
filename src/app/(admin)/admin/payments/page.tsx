import Link from "next/link";
import { adminPendingPayments } from "@/lib/admin";
import { formatPHP } from "@/lib/money";
import { PaymentActions } from "@/components/admin/payment-actions";
import { DataTable, EmptyState, PageHeader, Td, Th, Tr } from "@/components/shell/ui";

export const metadata = { title: "Payments · Admin" };

// Admin pages are per-request and RBAC-gated; they may block on navigation.
// (A layout's `instant = false` does not cover its child pages.)
export const instant = false;

export default async function AdminPaymentsPage() {
  const pending = await adminPendingPayments();

  return (
    <div>
      <PageHeader
        title="Payment verification"
        description="Check each reference against your GCash history before approving. Approving moves the order to “paid”."
      />
      {pending.length === 0 ? (
        <EmptyState>No payments awaiting verification.</EmptyState>
      ) : (
        <DataTable>
          <thead>
            <tr>
              <Th>Order</Th>
              <Th>Reference</Th>
              <Th>Declared</Th>
              <Th>Submitted</Th>
              <Th className="text-right">Action</Th>
            </tr>
          </thead>
          <tbody>
            {pending.map((p) => (
              <Tr key={p.paymentId}>
                <Td>
                  <Link href={`/admin/orders/${p.orderId}`} className="font-semibold hover:text-primary">
                    {p.orderNo}
                  </Link>
                </Td>
                <Td label="Reference" className="font-mono">{p.reference}</Td>
                <Td label="Declared">{formatPHP(p.amountCents)}</Td>
                <Td label="Submitted" className="text-muted-foreground">{p.submittedAt.toLocaleString("en-PH")}</Td>
                <Td className="text-right">
                  <PaymentActions paymentId={p.paymentId} />
                </Td>
              </Tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </div>
  );
}
