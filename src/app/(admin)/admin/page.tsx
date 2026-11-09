import Link from "next/link";
import { adminDashboard } from "@/lib/admin";
import { formatPHP } from "@/lib/money";

export const metadata = { title: "Admin Dashboard" };

export default async function AdminDashboardPage() {
  const stats = await adminDashboard();

  const cards = [
    { label: "Verified revenue", value: formatPHP(stats.revenueCents), accent: true },
    { label: "Awaiting payment", value: String(stats.awaitingPayment), href: "/admin/payments" },
    { label: "Paid orders", value: String(stats.paidOrders), href: "/admin/orders" },
    { label: "In production", value: String(stats.inProduction) },
    { label: "Shipped", value: String(stats.shipped) },
    { label: "Delivered", value: String(stats.delivered) },
  ];

  return (
    <div>
      <h1 className="mb-6 text-3xl font-extrabold">Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => {
          const inner = (
            <div
              className={`rounded-xl border-2 p-5 ${
                c.accent
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card"
              }`}
            >
              <p className="text-sm opacity-80">{c.label}</p>
              <p className="mt-1 text-3xl font-extrabold">{c.value}</p>
            </div>
          );
          return c.href ? (
            <Link key={c.label} href={c.href} className="block transition-transform hover:-translate-y-0.5">
              {inner}
            </Link>
          ) : (
            <div key={c.label}>{inner}</div>
          );
        })}
      </div>

      <div className="mt-8 rounded-xl border-2 border-border bg-card p-5">
        <h2 className="mb-3 font-bold">Top products</h2>
        {stats.topProducts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No orders yet.</p>
        ) : (
          <ul className="space-y-2">
            {stats.topProducts.map((p) => (
              <li key={p.name} className="flex justify-between text-sm">
                <span>{p.name}</span>
                <span className="font-bold">{p.qty} sold</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
