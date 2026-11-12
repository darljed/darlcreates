import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProductBySlug, listPublishedProducts } from "@/lib/catalog";
import { getProductReviews } from "@/lib/reviews";
import { fileUrl } from "@/lib/storage";
import { formatPHP } from "@/lib/money";
import { ProductCustomizer } from "@/components/product-customizer";
import { ProductPageSkeleton } from "@/components/skeletons";
import { ProductReviews } from "@/components/product-reviews";
import { JsonLd } from "@/components/json-ld";
import { getSiteInfo } from "@/lib/site-content";
import { absoluteUrl, breadcrumbLd, clip, pageMetadata, productLd } from "@/lib/seo";

export async function generateStaticParams() {
  const products = await listPublishedProducts();
  return products.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/products/[slug]">) {
  const { slug } = await params;
  const product = await getProductBySlug(slug, { publishedOnly: true });
  // notFound() here (not just in the page) lets the response carry a real 404 status, not a 200 "soft 404"
  if (!product) notFound();
  const img = product.photos[0] ? fileUrl(product.photos[0].key) : null;
  const price = formatPHP(product.basePriceCents);
  return pageMetadata({
    title: product.name,
    description: `${product.description ? clip(product.description, 105) : `${product.name}, a 3D printed ${product.category}.`} Made to order from ${price} in the Philippines.`,
    path: `/products/${product.slug}`,
    image: img ? { url: absoluteUrl(img), alt: product.photos[0].alt || product.name } : null,
  });
}

export default function ProductPage({
  params,
}: PageProps<"/products/[slug]">) {
  // Don't await params here: reading it outside <Suspense> blocks the navigation
  // for any slug not known at build time (e.g. a product created after deploy).
  return (
    <Suspense fallback={<ProductPageSkeleton />}>
      <ProductContent params={params} />
    </Suspense>
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
  const [reviews, { store }] = await Promise.all([getProductReviews(product.id), getSiteInfo()]);

  return (
    <main className="flex-1">
      <JsonLd
        data={productLd(product, {
          storeName: store.name,
          imageUrls: photos.map((p) => p.url),
          rating: { average: reviews.average, count: reviews.count },
        })}
      />
      <JsonLd
        data={breadcrumbLd([
          { name: "Shop", path: "/products" },
          { name: product.name, path: `/products/${product.slug}` },
        ])}
      />
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
