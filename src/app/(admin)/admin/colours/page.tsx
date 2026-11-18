import { ColourInventoryEditor } from "@/components/admin/colour-inventory-editor";
import { PageHeader } from "@/components/shell/ui";
import { DEFAULT_INVENTORY } from "@/lib/colour-inventory-schema";
import { loadColourInventory } from "@/lib/site-content-store";

export const metadata = { title: "Colours · Admin" };

// Admin pages are per-request and RBAC-gated; they may block on navigation.
// (A layout's `instant = false` does not cover its child pages.)
export const instant = false;

export default async function AdminColoursPage() {
  // Read straight from the DB (not the cached getter) so the editor never shows stale data.
  const saved = await loadColourInventory();
  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Colours"
        description="The filament colours you have in stock. Once saved, these are the only colours customers can pick: in the clicker and keychain designers, on colour options and for names."
      />
      <ColourInventoryEditor initial={saved ?? DEFAULT_INVENTORY} configured={Boolean(saved)} />
    </div>
  );
}
