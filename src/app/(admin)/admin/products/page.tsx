import Link from "next/link";
import { Plus, Box } from "lucide-react";
import { adminListProducts } from "@/lib/admin";
import { formatPHP } from "@/lib/money";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Products · Admin" };

const STATUS_STYLE: Record<string, string> = {
  published: "bg-green-600 text-white",
  draft: "bg-accent text-accent-foreground",
  archived: "bg-muted text-muted-foreground",
};

export default async function AdminProductsPage() {
  const products = await adminListProducts();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-extrabold">Products</h1>
        <Button asChild className="bg-primary text-primary-foreground">
          <Link href="/admin/products/new">
            <Plus className="mr-1 size-4" /> New product
          </Link>
        </Button>
      </div>

      {products.length === 0 ? (
        <p className="text-muted-foreground">No products yet.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border-2 border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-3 font-semibold">Name</th>
                <th className="p-3 font-semibold">Category</th>
                <th className="p-3 font-semibold">Base price</th>
                <th className="p-3 font-semibold">STL</th>
                <th className="p-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="p-3">
                    <Link
                      href={`/admin/products/${p.id}`}
                      className="font-semibold hover:text-primary"
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td className="p-3 capitalize text-muted-foreground">
                    {p.category}
                  </td>
                  <td className="p-3">{formatPHP(p.basePriceCents)}</td>
                  <td className="p-3">
                    {p.stlKey ? (
                      <Box className="size-4 text-primary" />
                    ) : (
                      <span className="text-xs text-muted-foreground">none</span>
                    )}
                  </td>
                  <td className="p-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                        STATUS_STYLE[p.status] ?? ""
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
