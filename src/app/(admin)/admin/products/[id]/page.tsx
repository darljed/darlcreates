import { eq } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { notFound } from "next/navigation";
import { getProductById } from "@/lib/catalog";
import { ProductForm } from "@/components/admin/product-form";
import { SchemaBuilder } from "@/components/admin/schema-builder";
import { ProductFiles } from "@/components/admin/product-files";
import { fileUrl } from "@/lib/storage";
import { PageHeader } from "@/components/shell/ui";
import { DeleteProductButton } from "@/components/admin/delete-product-button";
import { ClickerSetup } from "@/components/admin/clicker-setup";
import { clickerOptionOf } from "@/lib/clicker/of-product";
import { ProductCostingPanel } from "@/components/workshop/product-costing";
import { getProductCosting } from "@/lib/workshop/costing";
import { listPartsWithCost } from "@/lib/workshop/inventory";
import { KeychainSetup } from "@/components/admin/keychain-setup";
import { keychainOptionOf } from "@/lib/keychain/of-product";
import { NameSlotEditor } from "@/components/admin/name-slot-editor";
import { inStock } from "@/lib/colour-inventory-schema";
import { aiConfigured } from "@/lib/clicker/redraw";
import { loadColourInventory } from "@/lib/site-content-store";

export const metadata = { title: "Edit product · Admin" };

// Admin pages are per-request and RBAC-gated; they may block on navigation.
// (A layout's `instant = false` does not cover its child pages.)
export const instant = false;

export default async function EditProductPage({
  params,
}: PageProps<"/admin/products/[id]">) {
  const { id } = await params;
  const [product, inventory] = await Promise.all([getProductById(id, { raw: true }), loadColourInventory()]);
  if (!product) notFound();
  const clicker = clickerOptionOf(product.options);
  const keychain = keychainOptionOf(product.options);
  const [{ isService }] = await db.select({ isService: products.isService }).from(products).where(eq(products.id, id)).limit(1);
  const [costing, parts] = isService ? [null, []] : await Promise.all([getProductCosting(id), listPartsWithCost()]);

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <PageHeader title={product.name} />
        <ProductForm
          initial={{
            id: product.id,
            name: product.name,
            description: product.description,
            category: product.category,
            basePriceCents: product.basePriceCents,
            status: product.status as "draft" | "published" | "archived",
          }}
        />
      </div>

      <div>
        <h2 className="mb-2 text-sm font-bold">Files</h2>
        <ProductFiles
          productId={product.id}
          stlKey={product.stlKey}
          photos={product.photos.map((p) => ({
            id: p.id,
            url: fileUrl(p.key) ?? "",
            alt: p.alt,
          }))}
        />
      </div>

      {costing && <ProductCostingPanel key={`${costing.printCostCents}-${costing.bom.map((b) => `${b.partId}:${b.qty}`).join(",")}`} costing={costing} parts={parts} />}

      {!keychain && <ClickerSetup productId={product.id} initial={clicker?.config ?? null} canSwitchOn={product.options.length === 0} locked={isService} inventory={inventory} aiReady={aiConfigured()} />}
      {!clicker && <KeychainSetup productId={product.id} initial={keychain?.config ?? null} canSwitchOn={product.options.length === 0} locked={isService} inventory={inventory} />}

      {!clicker && !keychain && (
        <div>
          <h2 className="mb-2 text-sm font-bold">Customization options</h2>
          <SchemaBuilder productId={product.id} options={product.options} inventory={inventory} canDetect={Boolean(product.stlKey && /\.3mf$/i.test(product.stlKey))} />
        </div>
      )}

      {!clicker && !keychain && product.stlKey && /\.(stl|3mf)$/i.test(product.stlKey) && product.options.some((o) => o.type === "text") && (
        <NameSlotEditor
          productId={product.id}
          modelUrl={fileUrl(product.stlKey) ?? ""}
          canEngrave={/\.3mf$/i.test(product.stlKey)}
          options={product.options.filter((o) => o.type === "text").map((o) => ({ id: o.id, label: o.label, constraints: o.constraints }))}
          colors={(product.options.find((o) => o.type === "color")?.values ?? []).filter((v) => inStock(inventory, v.value)).map((v) => ({ label: v.label, hex: v.value }))}
        />
      )}

      {isService ? (
        <p className="border-t pt-4 text-xs text-muted-foreground">This is a standalone service. It stays in the shop at /{keychain ? "keychain" : "clicker"} and cannot be deleted.</p>
      ) : (
        <div className="border-t pt-4">
          <DeleteProductButton productId={product.id} name={product.name} redirectTo="/admin/products" />
        </div>
      )}
    </div>
  );
}
