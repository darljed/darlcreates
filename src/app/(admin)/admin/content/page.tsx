import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { ContentEditor } from "@/components/admin/content-editor";
import { PageHeader } from "@/components/shell/ui";
import { loadHomeContent } from "@/lib/site-content-store";

export const metadata = { title: "Landing page · Admin" };

// Admin pages are per-request and RBAC-gated; they may block on navigation.
// (A layout's `instant = false` does not cover its child pages.)
export const instant = false;

export default async function AdminContentPage() {
  // Read straight from the DB (not the cached getter) so the editor never shows stale text.
  const content = await loadHomeContent();
  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Landing page"
        description="Edit the text, buttons, highlights, FAQ and footer shown to customers."
        actions={
          <Link href="/" target="_blank" className="inline-flex items-center gap-1 text-xs font-semibold underline">
            View page <ExternalLink className="size-3" aria-hidden />
          </Link>
        }
      />
      <ContentEditor initial={content} />
    </div>
  );
}
