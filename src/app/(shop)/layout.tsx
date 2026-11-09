import { Suspense } from "react";
import { SiteHeader, SiteHeaderSkeleton } from "@/components/site-header";
import { Toaster } from "@/components/ui/sonner";

export default function ShopLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <Suspense fallback={<SiteHeaderSkeleton />}>
        <SiteHeader />
      </Suspense>
      {children}
      <Toaster richColors position="top-center" />
    </>
  );
}
