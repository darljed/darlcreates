import { SalesClient } from "@/components/workshop/sales-client";
import { PageHeader } from "@/components/shell/ui";
import { listProductCosting } from "@/lib/workshop/costing";
import { listPartsWithCost } from "@/lib/workshop/inventory";
import { listSales } from "@/lib/workshop/sales";

export const metadata = { title: "Sales log · Admin" };
export const instant = false;

export default async function SalesPage() {
  const [sales, products, parts] = await Promise.all([listSales(), listProductCosting(), listPartsWithCost()]);
  return (
    <div className="space-y-3">
      <PageHeader title="Sales log" description="Sales taken outside the website (Messenger, in person). Online orders are under Orders; both feed the dashboard." />
      <SalesClient initialSales={sales} products={products} parts={parts} />
    </div>
  );
}
