import Link from "next/link";
import { ProductForm } from "@/components/admin/product-form";

export const metadata = { title: "New product · Admin" };

export default function NewProductPage() {
  return (
    <div className="max-w-2xl">
      <Link href="/admin/products" className="text-sm text-muted-foreground hover:text-foreground">
        ← Products
      </Link>
      <h1 className="mb-6 mt-2 text-3xl font-extrabold">New product</h1>
      <ProductForm />
      <p className="mt-4 text-sm text-muted-foreground">
        After creating, you&apos;ll add customization options (colors, text,
        sizes).
      </p>
    </div>
  );
}
