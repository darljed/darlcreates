import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { aiDrafts } from "@/db/schema";
import { AiStudio } from "@/components/ai/ai-studio";
import { PageHeader, Panel } from "@/components/shell/ui";
import { draftSchema } from "@/lib/ai/product-copy";
import { getAiKey, getAiPrefs } from "@/lib/ai/settings";
import { fileUrl } from "@/lib/storage-url";

export const metadata = { title: "AI studio · Admin" };
export const instant = false;

export default async function AiStudioPage({ searchParams }: { searchParams: Promise<{ draft?: string }> }) {
  const { draft } = await searchParams;
  const [prefs, orKey, recent] = await Promise.all([
    getAiPrefs(),
    getAiKey("openrouter"),
    db.select({ id: aiDrafts.id, title: aiDrafts.title, status: aiDrafts.status, updatedAt: aiDrafts.updatedAt }).from(aiDrafts).where(eq(aiDrafts.kind, "product")).orderBy(desc(aiDrafts.updatedAt)).limit(8),
  ]);
  let current = null;
  if (draft && /^[0-9a-f-]{36}$/.test(draft)) {
    const [row] = await db.select().from(aiDrafts).where(eq(aiDrafts.id, draft)).limit(1);
    const p = row ? draftSchema.safeParse(row.payload) : null;
    if (row && p?.success) current = { id: row.id, status: row.status, payload: p.data, urls: Object.fromEntries([...p.data.photoKeys, ...p.data.images.map((i) => i.key)].map((k) => [k, fileUrl(k) ?? ""])) };
  }
  return (
    <div className="space-y-3">
      <PageHeader title="AI studio" description="Upload a 3MF or STL and photos of the real print. The AI drafts the product page and marketing images. Nothing reaches the shop until you approve." />
      <AiStudio key={current?.id ?? "new"} current={current} ready={{ copy: Boolean(prefs.copyModel), imagesKey: Boolean(orKey) }} />
      {recent.length > 0 && (
        <Panel title="Recent drafts">
          <ul className="divide-y text-sm">
            {recent.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-1.5">
                {r.status === "draft" ? <Link className="font-medium underline" href={`/admin/ai?draft=${r.id}`}>{r.title || "Untitled"}</Link> : <span>{r.title || "Untitled"}</span>}
                <span className="text-xs text-muted-foreground">{r.status} · {r.updatedAt.toLocaleDateString("en-PH")}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
