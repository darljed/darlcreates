import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { ClickerDesignerSkeleton } from "@/components/skeletons";
import { findKeychainProductSlug } from "@/lib/catalog";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Design your own name keychain",
  description: "Make a 3D-printed name keychain: type the name, pick a font, an icon, colours and thickness, and see it in 3D before you order.",
  path: "/keychain",
});

/** Short link to the name keychain designer: sends the visitor to the keychain product, wherever the owner keeps it. */
export default function KeychainPage() {
  return (
    <Suspense fallback={<ClickerDesignerSkeleton />}>
      <Go />
    </Suspense>
  );
}

async function Go(): Promise<React.ReactNode> {
  const slug = await findKeychainProductSlug();
  if (!slug) notFound();
  redirect(`/products/${slug}`);
}
