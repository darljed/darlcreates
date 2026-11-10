import Link from "next/link";
import { Plus, Box } from "lucide-react";
import { adminListProducts } from "@/lib/admin";
import { formatPHP } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { DataTable, EmptyState, PageHeader, Td, Th, Tr } from "@/components/shell/ui";

export const metadata = { title: "Products · Admin" };

// Admin pages are per-request and RBAC-gated; they may block on navigation.
// (A layout's `instant = false` does not cover its child pages.)
export const instant = false;

const STATUS_STYLE: Record<string, string> = {
  published: "bg-green-600 text-white",
  draft: "bg-accent text-accent-foreground",
  archived: "bg-muted text-muted-foreground",
};

export default async function AdminProductsPage() {
  const products = await adminListProducts();

  return (
    <div>
      <PageHeader
        title="Products"
        actions={
          <Button asChild size="sm" className="bg-primary text-primary-foreground">
            <Link href="/admin/products/new">
              <Plus className="mr-1 size-4" /> New product
            </Link>
          </Button>
        }
      />

      {products.length === 0 ? (
        <EmptyState>No products yet.</EmptyState>
      ) : (
        <DataTable>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Category</Th>
              <Th>Base price</Th>
              <Th>3D model</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <Tr key={p.id}>
                <Td>
                  <Link href={`/admin/products/${p.id}`} className="font-semibold hover:text-primary">
                    {p.name}
                  </Link>
                </Td>
                <Td className="capitalize text-muted-foreground">{p.category}</Td>
                <Td>{formatPHP(p.basePriceCents)}</Td>
                <Td>
                  {p.stlKey ? (
                    <Box className="size-4 text-primary" aria-label="Has 3D model" />
                  ) : (
                    <span className="text-xs text-muted-foreground">none</span>
                  )}
                </Td>
                <Td>
                  <span className={`rounded-md px-1.5 py-0.5 text-xs font-bold ${STATUS_STYLE[p.status] ?? ""}`}>
                    {p.status}
                  </span>
                </Td>
              </Tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </div>
  );
}
