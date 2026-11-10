import Link from "next/link";
import { notFound } from "next/navigation";
import { getProductById } from "@/lib/catalog";
import { ProductForm } from "@/components/admin/product-form";
import { SchemaBuilder } from "@/components/admin/schema-builder";
import { ProductFiles } from "@/components/admin/product-files";
import { fileUrl } from "@/lib/storage";

export const metadata = { title: "Edit product · Admin" };

export default async function EditProductPage({
  params,
}: PageProps<"/admin/products/[id]">) {
  const { id } = await params;
  const product = await getProductById(id);
  if (!product) notFound();

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <Link
          href="/admin/products"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Products
        </Link>
        <h1 className="mb-6 mt-2 text-3xl font-extrabold">{product.name}</h1>
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
        <h2 className="mb-4 text-2xl font-extrabold">Files</h2>
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
        <h2 className="mb-4 text-2xl font-extrabold">Customization options</h2>
        <SchemaBuilder productId={product.id} options={product.options} />
      </div>
    </div>
  );
}
