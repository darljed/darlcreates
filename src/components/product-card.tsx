import Link from "next/link";
import { Box } from "lucide-react";
import { formatPHP } from "@/lib/money";
import type { ProductListItem } from "@/lib/catalog";

export function ProductCard({
  product,
  imageUrl,
}: {
  product: ProductListItem;
  imageUrl: string | null;
}) {
  return (
    <Link
      href={`/products/${product.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-xl border-2 border-border bg-card transition-all hover:-translate-y-1 hover:border-primary hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative aspect-square overflow-hidden bg-muted">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={product.name}
            className="size-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-gradient-to-br from-primary/10 via-secondary/10 to-accent/20">
            <Box className="size-16 text-muted-foreground/50" />
          </div>
        )}
        <span className="absolute left-3 top-3 rounded-full bg-accent px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-accent-foreground">
          {product.category}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-bold leading-tight">{product.name}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
          {product.description}
        </p>
        <p className="mt-auto pt-3 text-lg font-extrabold text-primary">
          {formatPHP(product.basePriceCents)}
          <span className="ml-1 text-xs font-medium text-muted-foreground">
            + options
          </span>
        </p>
      </div>
    </Link>
  );
}
