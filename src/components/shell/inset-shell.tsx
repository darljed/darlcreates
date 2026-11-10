"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BadgeDollarSign, ClipboardList, FileText, Home, LayoutDashboard, MapPin, Menu, Package,
  Image as ImageIcon, PanelLeftClose, Users, PanelLeftOpen, Receipt, Scale, ShoppingBag, Star, Store, User,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/** Icons are referenced by name: component functions can't be passed from server to client. */
const ICONS = {
  dashboard: LayoutDashboard, products: Package, orders: ClipboardList, payments: BadgeDollarSign,
  reviews: Star, content: FileText, store: Store, cart: ShoppingBag, account: User, address: MapPin,
  receipt: Receipt, home: Home, legal: Scale, image: ImageIcon, users: Users,
} satisfies Record<string, LucideIcon>;
export type IconName = keyof typeof ICONS;

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  /** Count shown as a pill (e.g. pending payments). Hidden when 0/undefined. */
  badge?: number;
  /** Highlight only on an exact path match. */
  exact?: boolean;
};
export type NavGroup = { label?: string; items: NavItem[] };

/** Breadcrumb labels by path segment; anything unknown that looks like an id becomes "Details". */
function crumbs(pathname: string, rootLabel: string, labels: Record<string, string>, rootless: boolean) {
  const parts = pathname.split("/").filter(Boolean);
  // "rootless": the shell has no URL segment of its own (customer area), so the root crumb is "/"
  const out: { href: string; label: string }[] = rootless ? [{ href: "/", label: rootLabel }] : [];
  let acc = "";
  parts.forEach((seg, i) => {
    acc += `/${seg}`;
    if (i === 0 && !rootless) {
      out.push({ href: acc, label: rootLabel });
      return;
    }
    const known = labels[seg] ?? (parts[i - 1] === "users" ? "Details" : undefined); // /admin/users/<id>: ids are not readable
    const looksLikeId = /^[0-9a-f]{8}-[0-9a-f]{4}|^DC-\d{8}-/i.test(seg) || seg.length > 24;
    out.push({ href: acc, label: known ?? (/^DC-/.test(seg) ? seg : looksLikeId ? "Details" : seg.replace(/-/g, " ")) });
  });
  return out;
}

/**
 * Inset app shell: a tinted sidebar with the page content sitting in a raised, rounded panel
 * (the "inset" look). One shell for the admin (compact) and the customer area (comfortable);
 * density is a data attribute that globals.css and the page primitives key off.
 */
export function InsetShell({
  density,
  brand,
  groups,
  sidebarFooter,
  topbarRight,
  rootLabel,
  rootless = false,
  labels = {},
  children,
}: {
  density: "compact" | "comfortable";
  brand: React.ReactNode;
  groups: NavGroup[];
  sidebarFooter?: React.ReactNode;
  topbarRight?: React.ReactNode;
  rootLabel: string;
  /** True when pages live at top-level paths (/orders, /account) instead of under one root segment. */
  rootless?: boolean;
  labels?: Record<string, string>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  const trail = crumbs(pathname, rootLabel, labels, rootless);

  const nav = (isCollapsed: boolean, onNavigate?: () => void) => (
    <nav aria-label={`${rootLabel} navigation`} className="flex-1 space-y-4 overflow-y-auto py-2">
      {groups.map((g, gi) => (
        <div key={gi}>
          {g.label && !isCollapsed && (
            <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</p>
          )}
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              const Icon = ICONS[it.icon];
              const active = it.exact ? pathname === it.href : pathname === it.href || pathname.startsWith(`${it.href}/`);
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    title={isCollapsed ? it.label : undefined}
                    className={cn(
                      "group/nav relative flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isCollapsed && "justify-center",
                      active
                        ? "bg-background text-primary shadow-sm ring-1 ring-border"
                        : "text-sidebar-foreground/80 hover:bg-background/60 hover:text-sidebar-foreground",
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    {!isCollapsed && <span className="truncate">{it.label}</span>}
                    {it.badge ? (
                      <span
                        className={cn(
                          "ml-auto rounded-full bg-primary px-1.5 text-[10px] font-bold leading-4 text-primary-foreground",
                          isCollapsed && "absolute right-0.5 top-0.5 ml-0",
                        )}
                        aria-label={`${it.badge} pending`}
                      >
                        {it.badge > 99 ? "99+" : it.badge}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div data-density={density} className="group/shell flex min-h-screen bg-sidebar text-foreground">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "no-print sticky top-0 hidden h-screen shrink-0 flex-col px-2 pb-2 pt-3 transition-[width] md:flex",
          collapsed ? "w-14" : "w-56",
        )}
      >
        <div className={cn("flex items-center", collapsed ? "justify-center" : "justify-between px-1")}>
          {!collapsed && <div className="min-w-0">{brand}</div>}
          <Button
            type="button" variant="ghost" size="icon-sm"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-pressed={collapsed}
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </Button>
        </div>
        {nav(collapsed)}
        {sidebarFooter && <div className={cn("border-t pt-2", collapsed && "flex justify-center")}>{collapsed ? null : sidebarFooter}</div>}
      </aside>

      {/* Mobile drawer */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 bg-sidebar p-3">
          <SheetTitle className="sr-only">{rootLabel} menu</SheetTitle>
          <SheetDescription className="sr-only">Site navigation</SheetDescription>
          <div className="mb-2">{brand}</div>
          {nav(false, () => setOpen(false))}
          {sidebarFooter && <div className="border-t pt-2">{sidebarFooter}</div>}
        </SheetContent>
      </Sheet>

      {/* Inset content panel */}
      <div className="flex min-w-0 flex-1 flex-col p-2 md:pl-0">
        <div className="flex min-h-[calc(100vh-1rem)] flex-1 flex-col overflow-hidden rounded-xl border bg-background shadow-sm print:min-h-0 print:rounded-none print:border-0 print:shadow-none">
          <header className="no-print flex items-center gap-2 border-b px-3 py-2">
            <Button type="button" variant="ghost" size="icon-sm" className="md:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
              <Menu className="size-4" />
            </Button>
            <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
              <ol className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {trail.map((c, i) => (
                  <li key={c.href} className={cn("flex min-w-0 items-center gap-1.5", i < trail.length - 2 && "max-sm:hidden")}>
                    {i > 0 && <span aria-hidden className={cn(i === trail.length - 2 && "max-sm:hidden")}>/</span>}
                    {i === trail.length - 1 ? (
                      <span aria-current="page" className="truncate font-semibold capitalize text-foreground">{c.label}</span>
                    ) : (
                      <Link href={c.href} className="truncate capitalize hover:text-foreground">{c.label}</Link>
                    )}
                  </li>
                ))}
              </ol>
            </nav>
            {topbarRight}
          </header>
          <main id="main" className="flex-1 p-5 group-data-[density=compact]/shell:p-4 print:p-0">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
