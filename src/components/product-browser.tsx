"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { ProductCard } from "@/components/product-card";
import type { ProductListItem } from "@/lib/catalog";
import { categoryCounts, filterProducts } from "@/lib/product-filter";
import { cn } from "@/lib/utils";

export function ProductBrowser({ items }: { items: { product: ProductListItem; imageUrl: string | null }[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  const cats = useMemo(() => categoryCounts(items.map((i) => i.product)), [items]);
  const visible = useMemo(
    () => filterProducts(items.map((i) => ({ ...i, ...i.product })), query, category),
    [items, query, category],
  );

  const chip = "rounded-full border-2 px-3 py-1 text-sm font-semibold capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div>
      <div className="mb-6 space-y-4">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products…"
            aria-label="Search products"
            className="h-11 w-full rounded-full border-2 border-border bg-background pl-10 pr-10 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 hover:bg-muted">
              <X className="size-4" />
            </button>
          )}
        </div>

        {cats.length > 1 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
            <button type="button" aria-pressed={category === null} onClick={() => setCategory(null)}
              className={cn(chip, category === null ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary")}>
              All ({items.length})
            </button>
            {cats.map((c) => (
              <button key={c.category} type="button" aria-pressed={category === c.category} onClick={() => setCategory(category === c.category ? null : c.category)}
                className={cn(chip, category === c.category ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary")}>
                {c.category} ({c.count})
              </button>
            ))}
          </div>
        )}
        <p className="sr-only" role="status" aria-live="polite">{visible.length} product{visible.length === 1 ? "" : "s"} shown</p>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed p-10 text-center">
          <p className="text-muted-foreground">No products match{query ? <> &ldquo;{query}&rdquo;</> : null}{category ? <> in <b>{category}</b></> : null}.</p>
          <button type="button" onClick={() => { setQuery(""); setCategory(null); }} className="mt-3 text-sm font-semibold underline">Clear filters</button>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((v) => <ProductCard key={v.product.id} product={v.product} imageUrl={v.imageUrl} />)}
        </div>
      )}
    </div>
  );
}
