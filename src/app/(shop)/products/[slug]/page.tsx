import { Suspense } from "react";
import Link from "next/link";
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

export default function ProductPage({
  params,
}: PageProps<"/products/[slug]">) {
  // Don't await params here: reading it outside <Suspense> blocks the navigation
  // for any slug not known at build time (e.g. a product created after deploy).
  return (
    <Suspense fallback={<ProductSkeleton />}>
      <ProductContent params={params} />
    </Suspense>
  );
}

function ProductSkeleton() {
  return (
    <main className="flex-1" aria-busy="true">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 space-y-3">
          <div className="h-9 w-72 animate-pulse rounded-lg bg-muted" />
          <div className="h-4 w-96 max-w-full animate-pulse rounded bg-muted" />
        </div>
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="aspect-square animate-pulse rounded-xl bg-muted" />
          <div className="space-y-4">
            <div className="h-10 animate-pulse rounded-lg bg-muted" />
            <div className="h-10 animate-pulse rounded-lg bg-muted" />
            <div className="h-24 animate-pulse rounded-xl bg-muted" />
          </div>
        </div>
      </div>
    </main>
  );
}

async function ProductContent({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProductBySlug(slug, { publishedOnly: true });
  if (!product) notFound();

  const stlUrl = fileUrl(product.stlKey);
  const photos = product.photos.flatMap((p) => {
    const url = fileUrl(p.key);
    return url ? [{ url, alt: p.alt }] : [];
  });
  const reviews = await getProductReviews(product.id);

  return (
    <main className="flex-1">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <nav className="mb-6 text-sm text-muted-foreground">
          <Link href="/products" className="hover:text-foreground">
            Shop
          </Link>{" "}
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
          productName={product.name}
          basePriceCents={product.basePriceCents}
          options={product.options}
          stlUrl={stlUrl}
          photos={photos}
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
