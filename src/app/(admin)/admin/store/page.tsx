import { StoreEditor } from "@/components/admin/store-editor";
import { PageHeader } from "@/components/shell/ui";
import { loadSiteInfo } from "@/lib/site-content-store";

export const metadata = { title: "Store & footer · Admin" };

// Admin pages are per-request and RBAC-gated; they may block on navigation.
// (A layout's `instant = false` does not cover its child pages.)
export const instant = false;

export default async function AdminStorePage() {
  // Read straight from the DB (not the cached getter) so the editor never shows stale text.
  const info = await loadSiteInfo();
  return (
    <div className="max-w-4xl">
      <PageHeader title="Store & footer" description="Store details, contact info and links shown in the footer of every storefront page." />
      <StoreEditor initial={info} />
    </div>
  );
}
