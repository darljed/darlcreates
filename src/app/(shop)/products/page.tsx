import { listPublishedProducts } from "@/lib/catalog";
import { fileUrl } from "@/lib/storage";
import { ProductBrowser } from "@/components/product-browser";
import { JsonLd } from "@/components/json-ld";
import { itemListLd, pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Shop custom 3D printed products",
  description: "Browse ready-to-print designs, spin them in 3D, personalize the color, size or name, and we print and ship your order anywhere in the Philippines.",
  path: "/products",
});

export default async function ProductsPage() {
  const products = await listPublishedProducts();
  const withImages = products.map((p) => ({
    product: p,
    imageUrl: fileUrl(p.photoKey),
  }));

  return (
    <main className="flex-1">
      <JsonLd data={withImages.length ? itemListLd(products) : null} />
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <h1 className="text-4xl font-extrabold md:text-5xl">The Shop</h1>
          <p className="mt-3 max-w-xl text-primary-foreground/90">
            Pick a product, spin it in 3D, make it yours. Every item is printed
            to order.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-12">
        {withImages.length === 0 ? (
          <p className="text-muted-foreground">No products yet. Check back soon!</p>
        ) : (
          <ProductBrowser items={withImages} />
        )}
      </section>
    </main>
  );
}
