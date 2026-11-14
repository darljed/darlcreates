import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { listUsers, userCounts, userStateOf, type UserFilter } from "@/lib/user-admin";
import { formatPHP } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Initials, RoleBadge, UserStatusBadge } from "@/components/admin/user-badges";
import { DataTable, EmptyState, PageHeader, Td, Th, Tr } from "@/components/shell/ui";

export const metadata = { title: "Users · Admin" };

// Admin pages are per-request and RBAC-gated; they may block on navigation.
// (A layout's `instant = false` does not cover its child pages.)
export const instant = false;

const FILTERS: { key: UserFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "blocked", label: "Blocked" },
  { key: "admins", label: "Admins" },
  { key: "deleted", label: "Deleted" },
];

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  const sp = await searchParams;
  const filter = (FILTERS.find((f) => f.key === one(sp.filter))?.key ?? "all") as UserFilter;
  const q = one(sp.q).trim();
  const page = Math.max(1, Number.parseInt(one(sp.page), 10) || 1);

  const [{ rows, total, pageSize }, counts] = await Promise.all([listUsers({ filter, q: q || undefined, page }), userCounts()]);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  const href = (over: { filter?: UserFilter; page?: number }) => {
    const p = new URLSearchParams();
    const f = over.filter ?? filter;
    if (f !== "all") p.set("filter", f);
    if (q) p.set("q", q);
    if ((over.page ?? 1) > 1) p.set("page", String(over.page));
    const qs = p.toString();
    return qs ? `/admin/users?${qs}` : "/admin/users";
  };

  return (
    <div>
      <PageHeader
        title="Users"
        description="Find a customer, fix their details, sign them out or block them."
        actions={
          <form action="/admin/users" role="search" className="relative">
            {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Name or email"
              aria-label="Search users"
              className="h-8 w-64 rounded-md border bg-background pl-8 pr-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </form>
        }
      />

      <nav aria-label="Filter users" className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={href({ filter: f.key, page: 1 })}
            aria-current={filter === f.key ? "page" : undefined}
            className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
              filter === f.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary"
            }`}
          >
            {f.label}
            <span className={`ml-1.5 tabular-nums ${filter === f.key ? "opacity-80" : "text-muted-foreground"}`}>{counts[f.key]}</span>
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <EmptyState
          action={
            (q || filter !== "all") && (
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/users">Clear filters</Link>
              </Button>
            )
          }
        >
          {q ? `No users match “${q}”.` : "No users here."}
        </EmptyState>
      ) : (
        <>
          <DataTable>
            <thead>
              <tr>
                <Th>User</Th>
                <Th>Status</Th>
                <Th className="text-right">Orders</Th>
                <Th className="text-right">Spent</Th>
                <Th>Joined</Th>
                <Th>Last order</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <Tr key={u.id}>
                  <Td>
                    <Link href={`/admin/users/${u.id}`} className="flex min-w-0 items-center gap-2.5 hover:text-primary">
                      <Initials name={u.name} />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 font-semibold">
                          <span className="truncate">{u.name}</span>
                          <RoleBadge role={u.role} />
                        </span>
                        <span className="block max-w-64 truncate text-xs font-normal text-muted-foreground">{u.email}</span>
                      </span>
                    </Link>
                  </Td>
                  <Td label="Status">
                    <UserStatusBadge state={userStateOf(u)} />
                  </Td>
                  <Td label="Orders" className="text-right tabular-nums">
                    {u.orders}
                  </Td>
                  <Td label="Spent" className="whitespace-nowrap text-right tabular-nums">
                    {u.spentCents ? formatPHP(u.spentCents) : <span className="text-muted-foreground">-</span>}
                  </Td>
                  <Td label="Joined" className="whitespace-nowrap text-muted-foreground">
                    {u.createdAt.toLocaleDateString("en-PH")}
                  </Td>
                  <Td label="Last order" className="whitespace-nowrap text-muted-foreground">
                    {u.lastOrderAt ? u.lastOrderAt.toLocaleDateString("en-PH") : "Never"}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </DataTable>

          <nav aria-label="Pagination" className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <p>
              Showing {from}–{to} of {total.toLocaleString()}
            </p>
            {pages > 1 && (
              <div className="flex items-center gap-1.5">
                <Button asChild variant="outline" size="sm" disabled={page <= 1}>
                  <Link href={href({ page: page - 1 })} aria-disabled={page <= 1} aria-label="Previous page" className={page <= 1 ? "pointer-events-none opacity-50" : ""}>
                    <ChevronLeft className="size-4" /> Prev
                  </Link>
                </Button>
                <span className="px-1 tabular-nums">
                  Page {page} of {pages}
                </span>
                <Button asChild variant="outline" size="sm" disabled={page >= pages}>
                  <Link href={href({ page: page + 1 })} aria-disabled={page >= pages} aria-label="Next page" className={page >= pages ? "pointer-events-none opacity-50" : ""}>
                    Next <ChevronRight className="size-4" />
                  </Link>
                </Button>
              </div>
            )}
          </nav>
        </>
      )}
    </div>
  );
}
