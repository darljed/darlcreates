import { LegalEditor } from "@/components/admin/legal-editor";
import { PageHeader } from "@/components/shell/ui";
import { loadLegal } from "@/lib/site-content-store";

export const metadata = { title: "Legal pages · Admin" };

// Admin pages are per-request and RBAC-gated; they may block on navigation.
// (A layout's `instant = false` does not cover its child pages.)
export const instant = false;

export default async function AdminLegalPage() {
  const [privacy, terms] = await Promise.all([loadLegal("privacy"), loadLegal("terms")]);
  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Legal pages"
        description="Your Privacy Policy and Terms and Conditions. Have them reviewed by a lawyer or your accountant before relying on them."
      />
      <div className="space-y-3">
        <LegalEditor slug="privacy" initial={privacy} />
        <LegalEditor slug="terms" initial={terms} />
      </div>
    </div>
  );
}
