import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Page primitives shared by the admin (compact) and customer area (comfortable). They are server
 * components: density comes from the `group/shell` + `data-density` wrapper the InsetShell renders,
 * via Tailwind's group-data variants, so there is no client context or per-page prop.
 * Tables are deliberately square (no rounded corners) and flat.
 */
const compact = "group-data-[density=compact]/shell";

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-5 flex flex-wrap items-end justify-between gap-3", `${compact}:mb-3`, className)}>
      <div className="min-w-0">
        <h1 className={cn("text-2xl font-extrabold tracking-tight", `${compact}:text-lg`)}>{title}</h1>
        {description && (
          <p className={cn("mt-1 text-sm text-muted-foreground", `${compact}:mt-0.5 ${compact}:text-xs`)}>{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  flush = false,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  /** No body padding (for tables). */
  flush?: boolean;
}) {
  return (
    <section className={cn("rounded-lg border bg-card", className)}>
      {(title || actions) && (
        <div className={cn("flex items-center justify-between gap-3 border-b px-4 py-3", `${compact}:px-3 ${compact}:py-2`)}>
          <div className="min-w-0">
            <h2 className={cn("font-bold", `${compact}:text-sm`)}>{title}</h2>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className={cn(!flush && "p-4", !flush && `${compact}:p-3`, bodyClassName)}>{children}</div>
    </section>
  );
}

/** Flat, square-cornered data table. Use with Th / Tr / Td. */
export function DataTable({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-none border bg-card", className)}>
      <table className={cn("w-full border-collapse text-left text-sm", `${compact}:text-[13px]`)}>{children}</table>
    </div>
  );
}

export function Th({ className, ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn(
        "border-b bg-muted/60 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground",
        `${compact}:px-3 ${compact}:py-1.5 ${compact}:text-[11px]`,
        className,
      )}
      {...p}
    />
  );
}

export function Tr({ className, ...p }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("border-b last:border-b-0 transition-colors hover:bg-muted/40", className)} {...p} />;
}

export function Td({ className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-4 py-3 align-middle", `${compact}:px-3 ${compact}:py-1.5`, className)} {...p} />;
}

export function Stat({
  label,
  value,
  href,
  tone = "default",
  hint,
}: {
  label: string;
  value: React.ReactNode;
  href?: string;
  tone?: "default" | "primary" | "warn";
  hint?: string;
}) {
  const body = (
    <div
      className={cn(
        "rounded-lg border p-4 transition-colors",
        `${compact}:p-3`,
        tone === "primary" && "border-primary bg-primary text-primary-foreground",
        tone === "warn" && "border-accent bg-accent/40",
        tone === "default" && "bg-card",
        href && tone === "default" && "hover:border-primary",
      )}
    >
      <p className={cn("text-xs", tone === "primary" ? "opacity-85" : "text-muted-foreground")}>{label}</p>
      <p className={cn("mt-1 text-2xl font-extrabold leading-none", `${compact}:text-xl`)}>{value}</p>
      {hint && <p className={cn("mt-1 text-xs", tone === "primary" ? "opacity-80" : "text-muted-foreground")}>{hint}</p>}
    </div>
  );
  return href ? (
    <Link href={href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {body}
    </Link>
  ) : (
    body
  );
}

export function EmptyState({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
      <p>{children}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
