import { notFound } from "next/navigation";
import { getProductById } from "@/lib/catalog";
import { ProductForm } from "@/components/admin/product-form";
import { SchemaBuilder } from "@/components/admin/schema-builder";
import { ProductFiles } from "@/components/admin/product-files";
import { fileUrl } from "@/lib/storage";
import { PageHeader } from "@/components/shell/ui";
import { NameSlotEditor } from "@/components/admin/name-slot-editor";

export const metadata = { title: "Edit product · Admin" };

// Admin pages are per-request and RBAC-gated; they may block on navigation.
// (A layout's `instant = false` does not cover its child pages.)
export const instant = false;

export default async function EditProductPage({
  params,
}: PageProps<"/admin/products/[id]">) {
  const { id } = await params;
  const product = await getProductById(id);
  if (!product) notFound();

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

      <div>
        <h2 className="mb-2 text-sm font-bold">Customization options</h2>
        <SchemaBuilder productId={product.id} options={product.options} />
      </div>

      {product.stlKey && /\.(stl|3mf)$/i.test(product.stlKey) && product.options.some((o) => o.type === "text") && (
        <NameSlotEditor
          productId={product.id}
          modelUrl={fileUrl(product.stlKey) ?? ""}
          canEngrave={/\.3mf$/i.test(product.stlKey)}
          options={product.options.filter((o) => o.type === "text").map((o) => ({ id: o.id, label: o.label, constraints: o.constraints }))}
          colors={(product.options.find((o) => o.type === "color")?.values ?? []).map((v) => ({ label: v.label, hex: v.value }))}
        />
      )}
    </div>
  );
}
