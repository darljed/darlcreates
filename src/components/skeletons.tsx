/**
 * Loading placeholders, one per kind of page, shaped like the page they stand in for so nothing jumps when the real content
 * arrives. Used by the `loading.tsx` files (instant on navigation) and by the pages' own <Suspense> fallbacks. Server
 * components with no state. Each announces itself once to screen readers instead of showing the word "Loading".
 */
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Wrapper: marks the region busy and gives assistive technology one polite message. */
function Busy({ children, className, label = "Loading" }: { children: React.ReactNode; className?: string; label?: string }) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Storefront
// ---------------------------------------------------------------------------------------------------------------------

/** Steps row + title block used at the top of the cart and checkout. */
function StepsSkeleton() {
  return (
    <div className="mb-8 flex items-center gap-3" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-7 rounded-full" />
          <Skeleton className="hidden h-3 w-14 sm:block" />
          {i < 3 && <Skeleton className="h-0.5 w-6 sm:w-10" />}
        </div>
      ))}
    </div>
  );
}

function CartLineSkeleton() {
  return (
    <div className="flex gap-4 rounded-xl border-2 border-border bg-card p-4">
      <Skeleton className="size-20 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-5 w-48 max-w-full" />
        <Skeleton className="h-3.5 w-40 max-w-full" />
        <Skeleton className="h-3.5 w-32 max-w-full" />
        <div className="flex items-center gap-3 pt-2">
          <Skeleton className="h-9 w-28 rounded-lg" />
          <Skeleton className="h-8 w-20" />
        </div>
      </div>
      <div className="space-y-2 text-right">
        <Skeleton className="ml-auto h-5 w-20" />
        <Skeleton className="ml-auto h-3 w-16" />
      </div>
    </div>
  );
}

/** The cart's contents (lines and subtotal). The page's title and steps are already on screen when this shows. */
export function CartSkeleton() {
  return (
    <Busy label="Loading your cart" className="space-y-6">
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <CartLineSkeleton key={i} />
        ))}
      </div>
      <div className="space-y-3 rounded-xl border-2 border-border bg-muted/40 p-5">
        <div className="flex justify-between">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 w-28" />
        </div>
        <Skeleton className="h-3.5 w-56 max-w-full" />
        <Skeleton className="h-11 w-full rounded-lg" />
      </div>
    </Busy>
  );
}

function FieldSkeleton({ wide }: { wide?: boolean }) {
  return (
    <div className={cn("space-y-1.5", wide && "sm:col-span-2")}>
      <Skeleton className="h-3.5 w-24" />
      <Skeleton className="h-10 w-full rounded-lg" />
    </div>
  );
}

/** The checkout form and the order summary. */
export function CheckoutSkeleton() {
  return (
    <Busy label="Loading checkout" className="grid gap-8 md:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <Skeleton className="h-6 w-44" />
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldSkeleton />
          <FieldSkeleton />
          <FieldSkeleton wide />
          <FieldSkeleton wide />
          <FieldSkeleton />
          <FieldSkeleton />
        </div>
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
      <div className="h-fit space-y-3 rounded-xl border-2 border-border bg-muted/40 p-5">
        <Skeleton className="h-5 w-32" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex justify-between gap-2">
            <Skeleton className="h-3.5 w-36" />
            <Skeleton className="h-3.5 w-16" />
          </div>
        ))}
        <div className="flex justify-between border-t pt-3">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-24" />
        </div>
      </div>
    </Busy>
  );
}

/** Cart or checkout as a whole page (for `loading.tsx`, where the title is not on screen yet). */
export function ShopStepPageSkeleton({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex-1">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="mb-4 text-3xl font-extrabold">{title}</h1>
        <StepsSkeleton />
        {children}
      </div>
    </main>
  );
}

function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border-2 border-border bg-card">
      <Skeleton className="aspect-square w-full rounded-none" />
      <div className="space-y-2 p-4">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-3.5 w-1/3" />
        <Skeleton className="h-5 w-24" />
      </div>
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <Busy label="Loading products" className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </Busy>
  );
}

/** The shop listing: banner, search, category chips and the grid. */
export function ShopListSkeleton() {
  return (
    <main className="flex-1">
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <h1 className="text-4xl font-extrabold md:text-5xl">The Shop</h1>
          <Skeleton className="mt-4 h-4 w-80 max-w-full bg-primary-foreground/25" />
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-6 py-12">
        <div className="mb-6 space-y-4">
          <Skeleton className="h-11 w-full max-w-md rounded-full" />
          <div className="flex gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-8 w-20 rounded-full" />
            ))}
          </div>
        </div>
        <ProductGridSkeleton />
      </section>
    </main>
  );
}

/** A product page: title, the 3D box and the option pickers. */
export function ProductPageSkeleton() {
  return (
    <main className="flex-1">
      <Busy label="Loading product" className="mx-auto max-w-6xl px-6 py-10">
        <Skeleton className="mb-6 h-4 w-40" />
        <div className="mb-8 space-y-3">
          <Skeleton className="h-9 w-72 max-w-full" />
          <Skeleton className="h-4 w-96 max-w-full" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <Skeleton className="aspect-square w-full rounded-xl" />
            <div className="mt-3 flex gap-2">
              <Skeleton className="size-16 rounded-lg" />
              <Skeleton className="size-16 rounded-lg" />
            </div>
          </div>
          <div className="space-y-6">
            {[0, 1].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-5 w-32" />
                <div className="flex gap-2">
                  {[0, 1, 2, 3].map((j) => (
                    <Skeleton key={j} className="size-10 rounded-full" />
                  ))}
                </div>
              </div>
            ))}
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        </div>
      </Busy>
    </main>
  );
}

/** A page of text in a card or column: sign-in, consent, the legal pages. */
export function TextPageSkeleton() {
  return (
    <main className="flex-1">
      <Busy className="mx-auto max-w-3xl space-y-4 px-6 py-12">
        <Skeleton className="h-9 w-64 max-w-full" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ))}
      </Busy>
    </main>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Customer area and admin (inside the sidebar shell)
// ---------------------------------------------------------------------------------------------------------------------

/** Page title + description, like PageHeader. */
export function PageHeaderSkeleton({ actions = false }: { actions?: boolean }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 group-data-[density=compact]/shell:mb-3" aria-hidden>
      <div className="space-y-2">
        <Skeleton className="h-7 w-48 group-data-[density=compact]/shell:h-6" />
        <Skeleton className="h-3.5 w-72 max-w-full" />
      </div>
      {actions && <Skeleton className="h-9 w-28" />}
    </div>
  );
}

function PanelSkeleton({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-lg border bg-card p-4", className)}>{children}</div>;
}

/** A table: a toolbar row, a header row and `rows` body rows of `cols` cells. */
export function TableSkeleton({ rows = 8, cols = 5, toolbar = true }: { rows?: number; cols?: number; toolbar?: boolean }) {
  return (
    <div className="rounded-lg border bg-card" aria-hidden>
      {toolbar && (
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <Skeleton className="h-8 w-56 max-w-full" />
          <Skeleton className="h-8 w-20 rounded-full" />
          <Skeleton className="h-8 w-20 rounded-full" />
        </div>
      )}
      <div className="grid gap-4 border-b bg-muted/40 px-3 py-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {Array.from({ length: cols }, (_, i) => (
          <Skeleton key={i} className="h-3 w-16 bg-muted-foreground/20" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="grid gap-4 border-b px-3 py-3 last:border-b-0" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className={cn("h-4", c === 0 ? "w-3/4" : c % 2 ? "w-1/2" : "w-2/3")} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** A list page: header + table. */
export function ListPageSkeleton({ rows, cols, toolbar, actions }: { rows?: number; cols?: number; toolbar?: boolean; actions?: boolean }) {
  return (
    <Busy>
      <PageHeaderSkeleton actions={actions} />
      <TableSkeleton rows={rows} cols={cols} toolbar={toolbar} />
    </Busy>
  );
}

/** Stat tiles then two panels: the admin dashboard. */
export function DashboardSkeleton() {
  return (
    <Busy>
      <PageHeaderSkeleton />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <PanelSkeleton key={i} className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-24" />
          </PanelSkeleton>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <PanelSkeleton><TableSkeleton rows={5} cols={3} toolbar={false} /></PanelSkeleton>
        <PanelSkeleton><TableSkeleton rows={5} cols={3} toolbar={false} /></PanelSkeleton>
      </div>
    </Busy>
  );
}

/** A record's page: header and a main panel with a side panel (an order, a user, an acknowledgment). */
export function DetailPageSkeleton({ side = true }: { side?: boolean }) {
  return (
    <Busy>
      <PageHeaderSkeleton actions />
      <div className={cn("grid gap-4", side && "lg:grid-cols-[1fr_320px]")}>
        <div className="space-y-4">
          <PanelSkeleton className="space-y-3">
            <Skeleton className="h-5 w-36" />
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-12 shrink-0 rounded-md" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </PanelSkeleton>
          <PanelSkeleton className="space-y-2">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-5/6" />
          </PanelSkeleton>
        </div>
        {side && (
          <PanelSkeleton className="h-fit space-y-3">
            <Skeleton className="h-5 w-28" />
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="h-3.5 w-16" />
              </div>
            ))}
            <Skeleton className="h-9 w-full" />
          </PanelSkeleton>
        )}
      </div>
    </Busy>
  );
}

/** A form page: header and a few labelled fields in panels. */
export function FormPageSkeleton({ panels = 2 }: { panels?: number }) {
  return (
    <Busy>
      <PageHeaderSkeleton />
      <div className="space-y-4">
        {Array.from({ length: panels }, (_, p) => (
          <PanelSkeleton key={p} className="space-y-4">
            <Skeleton className="h-5 w-40" />
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldSkeleton />
              <FieldSkeleton />
              <FieldSkeleton wide />
            </div>
          </PanelSkeleton>
        ))}
      </div>
    </Busy>
  );
}

/** The account page's two panels (the address book and the data / deletion panel), without the page header. */
export function AccountSkeleton() {
  return (
    <Busy label="Loading your account" className="space-y-4">
      {[0, 1].map((p) => (
        <PanelSkeleton key={p} className="space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-4/5" />
          <Skeleton className="h-9 w-32" />
        </PanelSkeleton>
      ))}
    </Busy>
  );
}
