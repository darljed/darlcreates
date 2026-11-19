import { ShippingEditor } from "@/components/admin/shipping-editor";
import { PageHeader } from "@/components/shell/ui";
import { loadPsgcIndex } from "@/lib/psgc-server";
import { getShippingConfig } from "@/lib/site-content";

export const metadata = { title: "Shipping · Admin" };

// Admin pages are per-request and RBAC-gated; they may block on navigation.
export const instant = false;

export default async function AdminShippingPage() {
  const [config, index] = await Promise.all([getShippingConfig(), loadPsgcIndex()]);
  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Shipping"
        description="What delivery costs by weight and where the parcel goes. Customers see the fee at checkout and the table on the public Shipping rates page."
      />
      <ShippingEditor initial={config} index={index} />
    </div>
  );
}
