/**
 * Loading placeholders, one per page, built from the page's own layout: the real page header, stat tiles, table headers,
 * step bar and column grids are used as they are, and only the data that is still loading is a grey block. So the title
 * and structure stay where they will be and nothing jumps when the content arrives. Used by the `loading.tsx` files
 * (instant on navigation) and by the pages' own <Suspense> fallbacks. Server components with no state. Each region
 * announces itself once to screen readers instead of showing the word "Loading".
 */
import { CheckoutSteps } from "@/components/order-progress";
import { DataTable, PageHeader, Panel, Stat, Td, Th, Tr } from "@/components/shell/ui";
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

/** A placeholder that is allowed inside headings and paragraphs (a span, not a div). */
export function InlineBone({ className }: { className?: string }) {
  return <span aria-hidden className={cn("skeleton inline-block rounded-md bg-foreground/[0.07] align-middle", className)} />;
}

/** Text lines of varying length (the last one short). */
function Lines({ n = 3, className }: { n?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: n }, (_, i) => (
        <Skeleton key={i} className={cn("h-4", i === n - 1 ? "w-2/3" : i % 2 ? "w-11/12" : "w-full")} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Storefront: landing page
// ---------------------------------------------------------------------------------------------------------------------

/** On the primary-coloured hero a block is a lighter tint, not grey. */
const onPrimary = "bg-primary-foreground/20";

function HighlightSkeleton() {
  return (
    <div className="rounded-xl border-2 border-border bg-card p-6">
      <Skeleton className="mb-4 size-12 rounded-lg" />
      <Skeleton className="h-6 w-40" />
      <Lines n={2} className="mt-3" />
    </div>
  );
}

/** The landing page: hero, three highlights, featured products, questions and the closing band. */
export function LandingSkeleton() {
  return (
    <main className="flex-1">
      <Busy label="Loading the store" className="contents">
        {/* hero */}
        <section className="bg-primary text-primary-foreground">
          <div className="mx-auto max-w-6xl px-6 py-20 md:py-28">
            <div>
              <Skeleton className={cn("mb-6 h-7 w-44 rounded-full", onPrimary)} />
              <Skeleton className={cn("h-12 w-full max-w-xl md:h-[4.5rem]", onPrimary)} />
              <Skeleton className={cn("mt-3 h-12 w-4/5 max-w-lg md:h-[4.5rem]", onPrimary)} />
              <div className="mt-6 max-w-xl space-y-2">
                <Skeleton className={cn("h-5 w-full", onPrimary)} />
                <Skeleton className={cn("h-5 w-3/4", onPrimary)} />
              </div>
              <div className="mt-10 flex flex-wrap gap-4">
                <Skeleton className={cn("h-11 w-44 rounded-lg", onPrimary)} />
                <Skeleton className={cn("h-11 w-36 rounded-lg", onPrimary)} />
              </div>
            </div>
          </div>
        </section>

        {/* highlights */}
        <section className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid gap-6 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <HighlightSkeleton key={i} />
            ))}
          </div>
        </section>

        {/* featured products */}
        <section className="mx-auto max-w-6xl px-6 pb-16">
          <div className="mb-6 flex items-end justify-between gap-4">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        </section>

        {/* questions */}
        <section className="mx-auto max-w-3xl px-6 pb-16">
          <h2 className="mb-4 text-3xl font-extrabold">Questions</h2>
          <div className="divide-y rounded-lg border bg-card">
            {[0, 1, 2].map((i) => (
              <div key={i} className="px-4 py-4">
                <Skeleton className={cn("h-5", i % 2 ? "w-3/5" : "w-4/5")} />
              </div>
            ))}
          </div>
        </section>

        {/* closing band */}
        <section className="bg-secondary text-secondary-foreground">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-6 py-14 md:flex-row md:items-center md:justify-between">
            <Skeleton className="h-10 w-full max-w-md bg-secondary-foreground/20" />
            <Skeleton className="h-11 w-44 rounded-lg bg-secondary-foreground/20" />
          </div>
        </section>
      </Busy>
    </main>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Storefront: shop, product, cart, checkout
// ---------------------------------------------------------------------------------------------------------------------

/** Mirrors `ProductCard`: square picture with the category pill, name, two lines of description, price. */
export function ProductCardSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border-2 border-border bg-card">
      <div className="relative aspect-square bg-muted/60">
        <Skeleton className="absolute left-3 top-3 h-6 w-16 rounded-full" />
      </div>
      <div className="flex flex-1 flex-col p-4">
        <Skeleton className="h-5 w-3/4" />
        <div className="mt-2 space-y-1.5">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-2/3" />
        </div>
        <Skeleton className="mt-auto h-6 w-28" />
      </div>
    </div>
  );
}

/** The shop listing: the banner (its words are fixed), the search box and category chips, the 3-column grid. */
export function ShopListSkeleton() {
  return (
    <main className="flex-1">
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <h1 className="text-4xl font-extrabold md:text-5xl">The Shop</h1>
          <p className="mt-3 max-w-xl text-primary-foreground/90">Pick a product, spin it in 3D, make it yours. Every item is printed to order.</p>
        </div>
      </section>
      <Busy label="Loading products" className="mx-auto max-w-6xl px-6 py-12">
        <div className="mb-6 space-y-4">
          <Skeleton className="h-11 w-full max-w-md rounded-full" />
          <div className="flex flex-wrap gap-2">
            {[20, 16, 24, 20].map((w, i) => (
              <Skeleton key={i} className="h-8 rounded-full" style={{ width: `${w * 4}px` }} />
            ))}
          </div>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      </Busy>
    </main>
  );
}

/** A product page: breadcrumb, title block, the 3D box with thumbnails, and the customizer card with its price and button. */
export function ProductPageSkeleton() {
  return (
    <main className="flex-1">
      <Busy label="Loading product" className="mx-auto max-w-6xl px-6 py-10">
        <Skeleton className="mb-6 h-4 w-40" />
        <div className="mb-8 space-y-3">
          <Skeleton className="h-9 w-72 max-w-full md:h-10" />
          <Skeleton className="h-4 w-96 max-w-full" />
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <div>
            <Skeleton className="aspect-square w-full rounded-xl border-2" />
            <Skeleton className="mt-3 size-16 rounded-lg" />
          </div>
          <div className="space-y-6">
            <div className="space-y-3 rounded-xl border-2 border-border p-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-10 w-36 rounded-lg" />
              </div>
              <Skeleton className="h-10 w-full rounded-lg" />
              <div className="flex gap-2">
                <Skeleton className="h-16 w-28 rounded-lg" />
                <Skeleton className="h-16 w-28 rounded-lg" />
              </div>
              {[0, 1].map((i) => (
                <div key={i} className="space-y-1.5">
                  <Skeleton className="h-3.5 w-28" />
                  <div className="flex gap-2">
                    {[0, 1, 2, 3].map((j) => (
                      <Skeleton key={j} className="size-10 rounded-full" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <Skeleton className="h-10 w-full rounded-lg" />
            <div className="flex items-baseline justify-between rounded-xl border-2 border-border bg-muted/40 p-4">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-9 w-32" />
            </div>
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        </div>
      </Busy>
    </main>
  );
}

/** The clicker designer: viewer and clicker list on the left, the tools on the right, then the price bar. */
export function ClickerDesignerSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-3">
          <Skeleton className="aspect-square max-h-[70vh] w-full rounded-xl border-2 lg:aspect-[4/3]" />
          <div className="space-y-2 rounded-xl border-2 border-border p-3">
            <div className="flex gap-2">
              <Skeleton className="h-11 w-32 rounded-lg" />
              <Skeleton className="h-9 w-32 rounded-lg" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-[2.75rem] w-[8.5rem] rounded-lg" />
              <Skeleton className="ml-auto h-8 w-28 rounded-lg" />
            </div>
          </div>
        </div>
        <div className="rounded-xl border-2 border-border bg-card">
          <div className="flex gap-4 border-b-2 border-border px-3 py-3">
            {[16, 12, 14, 10, 14].map((w, i) => (
              <Skeleton key={i} className="h-4" style={{ width: `${w * 4}px` }} />
            ))}
          </div>
          <div className="space-y-4 p-4">
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
            <Lines n={2} />
          </div>
        </div>
      </div>
      <div className="flex items-end justify-between rounded-xl border-2 border-border bg-muted/40 p-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-9 w-32" />
        </div>
        <Skeleton className="h-11 w-56 rounded-lg" />
      </div>
    </div>
  );
}

function CartLineSkeleton() {
  return (
    <div className="flex gap-4 rounded-xl border-2 border-border bg-card p-4">
      <Skeleton className="size-20 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1">
        <Skeleton className="h-5 w-56 max-w-full" />
        <div className="mt-2 space-y-1.5">
          <Skeleton className="h-3.5 w-40 max-w-full" />
          <Skeleton className="h-3.5 w-48 max-w-full" />
          <Skeleton className="h-3.5 w-44 max-w-full" />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <Skeleton className="h-[2.75rem] w-[8.5rem] rounded-lg" />
          <Skeleton className="h-8 w-24" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Skeleton className="ml-auto h-6 w-20" />
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
      <div className="rounded-xl border-2 border-border bg-muted/40 p-5">
        <div className="flex items-center justify-between">
          <span className="text-lg font-semibold">Subtotal</span>
          <Skeleton className="h-7 w-28" />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Shipping is calculated at checkout.</p>
        <Skeleton className="mt-4 h-11 w-full rounded-lg" />
      </div>
    </Busy>
  );
}

function FieldSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{label}</p>
      <Skeleton className="h-10 w-full rounded-lg" />
    </div>
  );
}

/** The checkout form (the address fields in their real order and grid) and the order summary. */
export function CheckoutSkeleton() {
  return (
    <Busy label="Loading checkout" className="grid gap-8 md:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldSkeleton label="Full name" />
          <FieldSkeleton label="Mobile number" />
        </div>
        <FieldSkeleton label="Street / House no." />
        <FieldSkeleton label="Apt / Landmark (optional)" />
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldSkeleton label="Barangay" />
          <FieldSkeleton label="City / Municipality" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldSkeleton label="Province" />
          <FieldSkeleton label="Postal code" />
        </div>
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
      <aside className="h-fit rounded-xl border-2 border-border bg-muted/40 p-5">
        <h2 className="mb-3 font-bold">Order summary</h2>
        <ul className="space-y-2">
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex justify-between gap-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-16" />
            </li>
          ))}
        </ul>
        <div className="mt-3 space-y-2 border-t pt-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Shipping (flat)</span>
            <Skeleton className="h-4 w-14" />
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between border-t pt-3 text-lg font-extrabold">
          <span>Total</span>
          <Skeleton className="h-6 w-24" />
        </div>
      </aside>
    </Busy>
  );
}

/** Cart or checkout as a whole page (for `loading.tsx`): the real title and step bar, then the placeholder. */
export function ShopStepPageSkeleton({ title, current, children }: { title: string; current: 1 | 2 | 3 | 4; children: React.ReactNode }) {
  return (
    <main className="flex-1">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="mb-4 text-3xl font-extrabold">{title}</h1>
        <CheckoutSteps current={current} />
        {children}
      </div>
    </main>
  );
}

/** Sign-in: the centred card with its logo, welcome text and Google button. */
export function SignInSkeleton() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-20">
      <Busy label="Loading sign-in" className="w-full max-w-md rounded-xl border-2 bg-card py-6">
        <div className="px-6 text-center">
          <Skeleton className="mx-auto mb-3 size-16 rounded-xl" />
          <h1 className="text-2xl font-semibold leading-none">Welcome to Darl Creates</h1>
          <p className="mt-2 text-sm text-muted-foreground">Sign in to customize, order, and track your 3D prints.</p>
        </div>
        <div className="mt-6 px-6">
          <Skeleton className="h-11 w-full rounded-lg border-2" />
        </div>
      </Busy>
    </main>
  );
}

/** Privacy consent: the centred card with a heading, a paragraph, the tick box row and the button. */
export function ConsentSkeleton() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <Busy label="Loading" className="w-full max-w-lg space-y-4 rounded-xl border-2 bg-card p-6">
        <Skeleton className="h-8 w-64 max-w-full" />
        <Lines n={4} />
        <div className="flex items-start gap-3 pt-2">
          <Skeleton className="mt-1 size-4 shrink-0 rounded-sm" />
          <Lines n={2} className="flex-1" />
        </div>
        <Skeleton className="h-11 w-full rounded-lg" />
        <Skeleton className="h-3 w-4/5" />
      </Busy>
    </main>
  );
}

/** Privacy policy or terms: the narrow reading column with the title, its date line and headed paragraphs. */
export function LegalSkeleton({ title }: { title: string }) {
  return (
    <main className="flex-1">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-3xl font-extrabold">{title}</h1>
        <Skeleton className="mt-2 h-4 w-40" />
        <Busy label={`Loading ${title}`} className="mt-6 space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="mt-6 h-6 w-1/2" />
              <Lines n={3} />
              {i % 2 === 1 && (
                <div className="space-y-2 pl-5">
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              )}
            </div>
          ))}
        </Busy>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Customer area and admin (inside the sidebar shell). Real page header, stat tiles and table headers.
// ---------------------------------------------------------------------------------------------------------------------

/** A table with the page's real column names; only the rows are placeholders. `right` lists right-aligned columns, `thumb` adds a picture column. */
export function TableSkeleton({ headers, rows = 8, right = [], thumb = false, className }: { headers: string[]; rows?: number; right?: number[]; thumb?: boolean; className?: string }) {
  return (
    <DataTable className={className}>
      <thead>
        <tr>
          {thumb && <Th className="w-14"><span className="sr-only">Photo</span></Th>}
          {headers.map((h, i) => (
            <Th key={h} className={right.includes(i) ? "text-right" : undefined}>{h}</Th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }, (_, r) => (
          <Tr key={r}>
            {thumb && (
              <Td className="w-14 !py-1.5">
                <Skeleton className="size-10 rounded-none" />
              </Td>
            )}
            {headers.map((h, c) => (
              <Td key={h} className={right.includes(c) ? "text-right" : undefined}>
                <Skeleton className={cn("h-4", right.includes(c) ? "ml-auto w-14" : c === 0 ? "w-28" : c % 2 ? "w-20" : "w-32")} />
              </Td>
            ))}
          </Tr>
        ))}
      </tbody>
    </DataTable>
  );
}

function SearchBoxSkeleton() {
  return <Skeleton className="h-8 w-64 max-w-full rounded-md" />;
}

function ChipsSkeleton({ widths }: { widths: number[] }) {
  return (
    <div className="mb-3 flex flex-wrap gap-1.5" aria-hidden>
      {widths.map((w, i) => (
        <Skeleton key={i} className="h-[1.625rem] rounded-md" style={{ width: `${w}px` }} />
      ))}
    </div>
  );
}

/** A list page: the real title and description, an optional search box, status chips and button, then the table. */
export function ListPageSkeleton({
  title,
  description,
  headers,
  rows,
  right,
  thumb,
  search = false,
  chips,
  button,
}: {
  title: string;
  description?: React.ReactNode;
  headers: string[];
  rows?: number;
  right?: number[];
  thumb?: boolean;
  search?: boolean;
  /** Widths (px) of the filter chips shown above the table. */
  chips?: number[];
  /** A page action (for example "New product"): drawn as a button-sized block. */
  button?: boolean;
}) {
  return (
    <Busy>
      <PageHeader
        title={title}
        description={description === undefined ? <InlineBone className="h-3 w-40" /> : description}
        actions={search ? <SearchBoxSkeleton /> : button ? <Skeleton className="h-8 w-32 rounded-md" /> : undefined}
      />
      {chips && <ChipsSkeleton widths={chips} />}
      <TableSkeleton headers={headers} rows={rows} right={right} thumb={thumb} />
    </Busy>
  );
}

/** Admin dashboard: the six stat tiles (real labels), the revenue chart with top products, and recent orders. */
export function DashboardSkeleton() {
  const tiles: [string, string, boolean?][] = [
    ["Verified revenue", "excl. cancelled", true],
    ["Awaiting payment", "unpaid orders"],
    ["Paid orders", "incl. shipped"],
    ["In production", "being printed"],
    ["Shipped", "on the way"],
    ["Delivered", "completed"],
  ];
  return (
    <Busy>
      <PageHeader title="Dashboard" description="Verified payments only. Cancelled and refunded orders are excluded." />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map(([label, hint, primary]) => (
          <Stat key={label} label={label} hint={hint} tone={primary ? "primary" : "default"} value={<InlineBone className={cn("h-6 w-16", primary && "bg-primary-foreground/20")} />} />
        ))}
      </div>
      <div className="mb-4 grid gap-3 lg:grid-cols-3">
        <Panel title="Revenue, last 30 days" className="lg:col-span-2">
          <div className="flex h-48 items-end gap-1.5">
            {[40, 65, 30, 80, 55, 90, 45, 70, 35, 60, 85, 50].map((h, i) => (
              <Skeleton key={i} className="flex-1 rounded-sm" style={{ height: `${h}%` }} />
            ))}
          </div>
        </Panel>
        <Panel title="Top products" bodyClassName="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </Panel>
      </div>
      <Panel title="Recent orders" flush>
        <TableSkeleton headers={["Order", "Customer", "Placed", "Total", "Status"]} right={[3]} rows={5} className="border-0" />
      </Panel>
    </Busy>
  );
}

function LabelValueRows({ labels }: { labels: string[] }) {
  return (
    <dl className="space-y-2 text-sm">
      {labels.map((l) => (
        <div key={l} className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{l}</dt>
          <dd><Skeleton className="h-4 w-24" /></dd>
        </div>
      ))}
    </dl>
  );
}

/** An order in the admin: number, status and actions, then the items on the left and customer, address and payment on the right. */
export function AdminOrderSkeleton() {
  return (
    <Busy>
      <PageHeader title={<InlineBone className="h-6 w-44" />} description={<InlineBone className="h-3 w-52" />} actions={<Skeleton className="h-8 w-28 rounded-md" />} />
      <div className="grid gap-4 md:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <Panel title="Items & print files" bodyClassName="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 rounded-md border p-2">
                <Skeleton className="size-12 shrink-0 rounded-md" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
                <Skeleton className="h-8 w-28 rounded-md" />
              </div>
            ))}
          </Panel>
        </div>
        <div className="space-y-4">
          <Panel title="Customer"><LabelValueRows labels={["Name", "Email"]} /></Panel>
          <Panel title="Ship to"><Lines n={3} /></Panel>
          <Panel title="Latest payment"><LabelValueRows labels={["Reference", "Amount", "Status"]} /></Panel>
        </div>
      </div>
    </Busy>
  );
}

/** A user in the admin: four summary tiles, then profile, addresses and orders beside the controls and logs. */
export function AdminUserSkeleton() {
  return (
    <Busy>
      <PageHeader title={<InlineBone className="h-6 w-48" />} description={<InlineBone className="h-3 w-56" />} />
      <dl className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {["Orders", "Spent", "Joined", "Last order"].map((l) => (
          <div key={l} className="rounded-lg border bg-card p-3">
            <dt className="text-xs text-muted-foreground">{l}</dt>
            <dd className="mt-1"><Skeleton className="h-5 w-20" /></dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
        <div className="space-y-4">
          <Panel title="Profile"><LabelValueRows labels={["Name", "Email", "Phone"]} /></Panel>
          <Panel title="Saved addresses"><Lines n={3} /></Panel>
          <Panel title="Recent orders" flush>
            <TableSkeleton headers={["Order", "Placed", "Total", "Status"]} right={[2]} rows={3} className="border-0" />
          </Panel>
        </div>
        <div className="space-y-4">
          <Panel title="Account controls"><Skeleton className="h-9 w-full" /></Panel>
          <Panel title="Signed in on"><Lines n={2} /></Panel>
          <Panel title="Activity log"><Lines n={3} /></Panel>
        </div>
      </div>
    </Busy>
  );
}

/** A customer's order: number, progress bar, the payment panel, items and totals. */
export function PortalOrderSkeleton() {
  return (
    <Busy className="max-w-5xl space-y-5">
      <PageHeader title={<InlineBone className="h-7 w-52" />} description={<InlineBone className="h-3 w-36" />} actions={<Skeleton className="h-6 w-24 rounded-full" />} />
      <ol className="grid grid-cols-6 gap-1" aria-hidden>
        {["Placed", "Paid", "Printing", "Packed", "Shipped", "Delivered"].map((l) => (
          <li key={l} className="flex flex-col items-center gap-1 text-center">
            <Skeleton className="size-7 rounded-full" />
            <span className="text-xs text-muted-foreground">{l}</span>
          </li>
        ))}
      </ol>
      <Panel title="Items" bodyClassName="space-y-3">
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-14 shrink-0 rounded-md" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-2/3" />
            </div>
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </Panel>
      <Panel title="Delivery and total"><LabelValueRows labels={["Ship to", "Subtotal", "Shipping", "Total"]} /></Panel>
    </Busy>
  );
}

/** A form page: the real title and description, then panels of labelled fields. */
export function FormPageSkeleton({ title, description, panels = 2 }: { title: React.ReactNode; description?: React.ReactNode; panels?: number }) {
  return (
    <Busy>
      <PageHeader title={title} description={description} />
      <div className="space-y-4">
        {Array.from({ length: panels }, (_, p) => (
          <div key={p} className="space-y-4 rounded-lg border bg-card p-4">
            <Skeleton className="h-5 w-40" />
            <div className="grid gap-4 sm:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className={cn("space-y-1.5", i === 2 && "sm:col-span-2")}>
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className={cn("w-full rounded-md", i === 2 ? "h-20" : "h-9")} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Busy>
  );
}

/** The account page's two panels (the address book, and data and deletion), without the page header. */
export function AccountSkeleton() {
  return (
    <Busy label="Loading your account" className="space-y-4">
      <Panel title="Saved addresses" bodyClassName="space-y-3">
        <Lines n={3} />
        <Skeleton className="h-9 w-36" />
      </Panel>
      <Panel title="Your data" bodyClassName="space-y-3">
        <Lines n={2} />
        <Skeleton className="h-9 w-40" />
      </Panel>
    </Busy>
  );
}

/** The order acknowledgment: a back link and print button, then the paper-like document. */
export function AcknowledgmentSkeleton() {
  return (
    <Busy className="space-y-4">
      <div className="mx-auto flex max-w-2xl items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-24 rounded-md" />
      </div>
      <div className="mx-auto max-w-2xl space-y-5 rounded-lg border bg-card p-8">
        <div className="space-y-2 text-center">
          <Skeleton className="mx-auto h-8 w-64" />
          <Skeleton className="mx-auto h-4 w-40" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Lines n={3} />
          <Lines n={3} />
        </div>
        <TableSkeleton headers={["Item", "Qty", "Price"]} right={[1, 2]} rows={3} />
        <div className="ml-auto w-1/2"><LabelValueRows labels={["Subtotal", "Shipping", "Total"]} /></div>
      </div>
    </Busy>
  );
}
