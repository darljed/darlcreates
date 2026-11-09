import Link from "next/link";
import {
  LayoutDashboard,
  Package,
  ClipboardList,
  BadgeDollarSign,
  Star,
} from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { Toaster } from "@/components/ui/sonner";

// The whole /admin tree is per-request, RBAC-gated, and uncacheable.
export const instant = false;

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  // Server-side RBAC gate for the entire /admin tree.
  await requireAdmin();

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 border-r-2 border-border bg-sidebar p-4 md:block">
        <Link href="/" className="mb-6 flex items-center gap-2 font-extrabold">
          <span className="inline-flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            DC
          </span>
          Admin
        </Link>
        <nav className="space-y-1">
          <NavLink href="/admin" icon={LayoutDashboard}>
            Dashboard
          </NavLink>
          <NavLink href="/admin/products" icon={Package}>
            Products
          </NavLink>
          <NavLink href="/admin/orders" icon={ClipboardList}>
            Orders
          </NavLink>
          <NavLink href="/admin/payments" icon={BadgeDollarSign}>
            Payments
          </NavLink>
          <NavLink href="/admin/reviews" icon={Star}>
            Reviews
          </NavLink>
        </nav>
      </aside>
      <main className="flex-1 bg-background">
        <div className="border-b-2 border-border p-3 md:hidden">
          <nav className="flex gap-3 overflow-x-auto text-sm font-medium">
            <Link href="/admin">Dashboard</Link>
            <Link href="/admin/products">Products</Link>
            <Link href="/admin/orders">Orders</Link>
            <Link href="/admin/payments">Payments</Link>
            <Link href="/admin/reviews">Reviews</Link>
          </nav>
        </div>
        <div className="mx-auto max-w-6xl p-6">{children}</div>
      </main>
      <Toaster richColors position="top-center" />
    </div>
  );
}

function NavLink({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-lg px-3 py-2 font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
    >
      <Icon className="size-4" /> {children}
    </Link>
  );
}
