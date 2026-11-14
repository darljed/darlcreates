import { ProductForm } from "@/components/admin/product-form";
import { PageHeader } from "@/components/shell/ui";

export const metadata = { title: "New product · Admin" };

export default function NewProductPage() {
  return (
    <div className="max-w-2xl">
      <PageHeader
        title="New product"
        description="After creating, you'll add customization options (colors, text, sizes)."
      />
      <ProductForm />
    </div>
  );
}
