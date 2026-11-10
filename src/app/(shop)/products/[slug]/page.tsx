import { notFound } from "next/navigation";
import { getProductBySlug, listPublishedProducts } from "@/lib/catalog";
import { getProductReviews } from "@/lib/reviews";
import { fileUrl } from "@/lib/storage";
import { formatPHP } from "@/lib/money";
import { ProductCustomizer } from "@/components/product-customizer";
import { ProductReviews } from "@/components/product-reviews";

export async function generateStaticParams() {
  const products = await listPublishedProducts();
  return products.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/products/[slug]">) {
  const { slug } = await params;
  const product = await getProductBySlug(slug, { publishedOnly: true });
  return { title: product?.name ?? "Product" };
}

export default async function ProductPage({
  params,
}: PageProps<"/products/[slug]">) {
  const { slug } = await params;
  const product = await getProductBySlug(slug, { publishedOnly: true });
  if (!product) notFound();

  const stlUrl = fileUrl(product.stlKey);
  const photoUrls = product.photos.map((p) => fileUrl(p.key));
  const reviews = await getProductReviews(product.id);

  return (
    <main className="flex-1">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <nav className="mb-6 text-sm text-muted-foreground">
          <a href="/products" className="hover:text-foreground">
            Shop
          </a>{" "}
          / <span className="capitalize">{product.category}</span>
        </nav>

        <div className="mb-8">
          <h1 className="text-3xl font-extrabold md:text-4xl">{product.name}</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            {product.description}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Starting at{" "}
            <span className="font-bold text-primary">
              {formatPHP(product.basePriceCents)}
            </span>
          </p>
        </div>

        <ProductCustomizer
          productId={product.id}
          basePriceCents={product.basePriceCents}
          options={product.options}
          stlUrl={stlUrl}
          photoUrls={photoUrls.filter((u): u is string => Boolean(u))}
        />

        <ProductReviews
          productId={product.id}
          slug={product.slug}
          reviews={reviews.reviews}
          average={reviews.average}
          count={reviews.count}
        />
      </div>
    </main>
  );
}
