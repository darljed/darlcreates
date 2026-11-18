import { InventoryClient } from "@/components/workshop/inventory-client";
import { PageHeader } from "@/components/shell/ui";
import { listPartsWithCost } from "@/lib/workshop/inventory";

export const metadata = { title: "Inventory · Admin" };
// Admin pages are per-request and RBAC-gated; they may block on navigation.
export const instant = false;

export default async function InventoryPage() {
  const parts = await listPartsWithCost();
  return (
    <div className="space-y-3">
      <PageHeader title="Inventory" description="Parts and filament you stock: what you bought, what it cost, what is left. Orders and sales use it up through each product's bill of materials." />
      <InventoryClient initialParts={parts} />
    </div>
  );
}
