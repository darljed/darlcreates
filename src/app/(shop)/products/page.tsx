import { listPublishedProducts } from "@/lib/catalog";
import { readUrl } from "@/lib/storage";
import { ProductCard } from "@/components/product-card";

export const metadata = { title: "Shop" };

export default async function ProductsPage() {
  const products = await listPublishedProducts();
  const withImages = await Promise.all(
    products.map(async (p) => ({
      product: p,
      imageUrl: await readUrl(p.photoKey),
    })),
  );

  const categories = Array.from(
    new Set(products.map((p) => p.category)),
  ).sort();

  return (
    <main className="flex-1">
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <h1 className="text-4xl font-extrabold md:text-5xl">The Shop</h1>
          <p className="mt-3 max-w-xl text-primary-foreground/90">
            Pick a product, spin it in 3D, make it yours. Every item is printed
            to order.
          </p>
          {categories.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {categories.map((c) => (
                <span
                  key={c}
                  className="rounded-full bg-primary-foreground/15 px-3 py-1 text-sm font-medium capitalize"
                >
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-12">
        {withImages.length === 0 ? (
          <p className="text-muted-foreground">
            No products yet. Check back soon!
          </p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {withImages.map(({ product, imageUrl }) => (
              <ProductCard
                key={product.id}
                product={product}
                imageUrl={imageUrl}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
