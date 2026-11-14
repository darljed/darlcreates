import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { ClickerDesignerSkeleton } from "@/components/skeletons";
import { findClickerProductSlug } from "@/lib/catalog";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Design your own clicker",
  description: "Make your own clicker: add text or a picture, pick a shape, colours and a keyring, and see it in 3D before you order.",
  path: "/clicker",
});

/** Short link to the clicker designer: sends the visitor to the clicker product, wherever the owner keeps it. */
export default function ClickerPage() {
  return (
    <Suspense fallback={<ClickerDesignerSkeleton />}>
      <Go />
    </Suspense>
  );
}

async function Go(): Promise<React.ReactNode> {
  const slug = await findClickerProductSlug();
  if (!slug) notFound();
  redirect(`/products/${slug}`);
}
