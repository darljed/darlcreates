import { Suspense } from "react";
import { SiteHeader, SiteHeaderSkeleton } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { NotFoundView } from "@/components/not-found-view";

export const metadata = { title: "Page not found" };

/** Unmatched URLs. Sits outside every route group, so it brings its own header and footer. */
export default function NotFound() {
  return (
    <>
      <Suspense fallback={<SiteHeaderSkeleton />}>
        <SiteHeader />
      </Suspense>
      <main className="flex flex-1 flex-col">
        <NotFoundView />
      </main>
      <Suspense fallback={null}>
        <SiteFooter />
      </Suspense>
    </>
  );
}
