import { EstimatorClient, type EstimatorPart } from "@/components/workshop/estimator-client";
import { PageHeader } from "@/components/shell/ui";
import { listProductCosting } from "@/lib/workshop/costing";
import { listEstimates, listEstimateTags } from "@/lib/workshop/estimates";
import { listPartsWithCost } from "@/lib/workshop/inventory";

export const metadata = { title: "Estimator · Admin" };
export const instant = false;

export default async function EstimatorPage() {
  const [parts, estimates, tags, products] = await Promise.all([listPartsWithCost(), listEstimates(), listEstimateTags(), listProductCosting()]);
  const estimatorParts: EstimatorPart[] = parts.map((p) => ({ id: p.id, name: p.name, unit: p.unit, category: p.category, unitPricePesos: p.unitCostCents / 100 }));
  return (
    <div className="space-y-3">
      <PageHeader title="Estimator" description="Filament + machine time + labour: the true cost of a job and three prices. Save estimates, and turn one into a product." />
      <EstimatorClient parts={estimatorParts} initialEstimates={estimates} initialTags={tags} products={products.map((p) => ({ id: p.id, name: p.name }))} />
    </div>
  );
}
