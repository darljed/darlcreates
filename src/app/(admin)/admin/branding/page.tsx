import { BrandingEditor } from "@/components/admin/branding-editor";
import { PageHeader } from "@/components/shell/ui";
import { loadBranding, loadSiteInfo } from "@/lib/site-content-store";

export const metadata = { title: "Logos & branding · Admin" };

// Admin pages are per-request and RBAC-gated; they may block on navigation.
// (A layout's `instant = false` does not cover its child pages.)
export const instant = false;

export default async function AdminBrandingPage() {
  // Read straight from the DB (not the cached getters) so the editor never shows stale data.
  const [branding, info] = await Promise.all([loadBranding(), loadSiteInfo()]);
  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Logos & branding"
        description="Upload your logo for the navigation bar, footer and browser tab, plus the image shown when your website link is shared."
      />
      <BrandingEditor initial={branding} storeName={info.store.name} tagline={info.store.tagline} />
    </div>
  );
}
