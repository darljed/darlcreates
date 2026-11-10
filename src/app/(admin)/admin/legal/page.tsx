import { LegalWorkspace } from "@/components/admin/legal-workspace";
import { PageHeader } from "@/components/shell/ui";
import { legalKey, loadLegal, loadMeta, privacyAcceptance } from "@/lib/site-content-store";

export const metadata = { title: "Legal pages · Admin" };

// Admin pages are per-request and RBAC-gated; they may block on navigation.
// (A layout's `instant = false` does not cover its child pages.)
export const instant = false;

const iso = (m: Awaited<ReturnType<typeof loadMeta>>) =>
  m ? { updatedAt: m.updatedAt.toISOString(), updatedByName: m.updatedByName } : null;

export default async function AdminLegalPage() {
  const [privacy, terms, pMeta, tMeta] = await Promise.all([
    loadLegal("privacy"),
    loadLegal("terms"),
    loadMeta(legalKey("privacy")),
    loadMeta(legalKey("terms")),
  ]);
  const acceptance = await privacyAcceptance(privacy.version);
  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Legal pages"
        description="Your Privacy Policy and Terms and Conditions. Have them reviewed by a lawyer or your accountant before relying on them."
      />
      <LegalWorkspace privacy={{ doc: privacy, meta: iso(pMeta) }} terms={{ doc: terms, meta: iso(tMeta) }} acceptance={acceptance} />
    </div>
  );
}
