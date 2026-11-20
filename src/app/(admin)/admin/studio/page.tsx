import Link from "next/link";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { productOptions, products } from "@/db/schema";
import { getProductById } from "@/lib/catalog";
import { clickerOptionOf } from "@/lib/clicker/of-product";
import { keychainOptionOf } from "@/lib/keychain/of-product";
import { ClickerDesigner } from "@/components/clicker/clicker-designer";
import { KeychainDesigner } from "@/components/keychain/keychain-designer";
import { EmptyState, PageHeader } from "@/components/shell/ui";
import { cn } from "@/lib/utils";

export const metadata = { title: "Design studio · Admin" };
export const instant = false;

type Tool = "keychain" | "clicker";

/** The first product (any status) whose designer settings the tool uses: the studio follows the shop's own limits and fonts. */
async function toolProductId(tool: Tool): Promise<string | null> {
  const [row] = await db
    .select({ id: products.id })
    .from(products)
    .innerJoin(productOptions, eq(productOptions.productId, products.id))
    .where(and(sql`${productOptions.constraints} ? ${tool}`))
    .orderBy(asc(products.createdAt))
    .limit(1);
  return row?.id ?? null;
}

export default async function StudioPage({ searchParams }: { searchParams: Promise<{ tool?: string }> }) {
  const { tool: t } = await searchParams;
  const tool: Tool = t === "clicker" ? "clicker" : "keychain";
  const id = await toolProductId(tool);
  const product = id ? await getProductById(id, { raw: true }) : null;
  const clicker = product && tool === "clicker" ? clickerOptionOf(product.options) : null;
  const keychain = product && tool === "keychain" ? keychainOptionOf(product.options) : null;

  return (
    <div className="space-y-4">
      <PageHeader title="Design studio" description="Design a clicker or a name keychain for an order that came in off the site, then download the print file: 3MF keeps the colours, STL is a zip with one file per colour." />
      <div role="tablist" aria-label="Tool" className="flex gap-2">
        {(["keychain", "clicker"] as const).map((k) => (
          <Link key={k} href={`/admin/studio?tool=${k}`} role="tab" aria-selected={tool === k} className={cn("rounded-lg border-2 px-4 py-2 text-sm font-semibold", tool === k ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary")}>
            {k === "keychain" ? "Name keychain" : "Clicker"}
          </Link>
        ))}
      </div>
      {product && clicker ? (
        <ClickerDesigner key="clicker" studio productId={product.id} basePriceCents={product.basePriceCents} optionId={clicker.option.id} config={{ ...clicker.config, allowAi: false }} />
      ) : product && keychain ? (
        <KeychainDesigner key="keychain" studio productId={product.id} basePriceCents={product.basePriceCents} optionId={keychain.option.id} config={keychain.config} />
      ) : (
        <EmptyState>{`No ${tool} designer product yet. The studio uses its settings, so create one under Admin → Products first.`}</EmptyState>
      )}
    </div>
  );
}
