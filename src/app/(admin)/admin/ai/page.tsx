import Link from "next/link";
import { connection } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { aiDrafts } from "@/db/schema";
import { AiStudio, type StudioProduct } from "@/components/ai/ai-studio";
import { PageHeader, Panel } from "@/components/shell/ui";
import { adminListProducts } from "@/lib/admin";
import { getProductById } from "@/lib/catalog";
import { applyInventory } from "@/lib/colour-inventory-schema";
import { listImageModels } from "@/lib/ai/providers";
import { getAiKey, getAiPrefs, PROVIDER_LABEL } from "@/lib/ai/settings";
import { findProductChat, loadDraft, snapshotOf } from "@/lib/ai/studio";
import { productGallery, realPhotoCount } from "@/lib/ai/image-studio";
import { DESIGN_MODE_LABEL, effectiveMode, resolvePresets } from "@/lib/presets";
import { loadColourInventory } from "@/lib/site-content-store";
import { fileUrl } from "@/lib/storage-url";

export const metadata = { title: "Product studio · Admin" };
export const instant = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The product panel: what customers get now (designs checked against the colours offered today). */
async function productPanel(id: string): Promise<StudioProduct | null> {
  const [p, inventory] = await Promise.all([getProductById(id, { raw: true }), loadColourInventory()]);
  if (!p || p.options.some((o) => o.type === "text" && (o.constraints.clicker || o.constraints.keychain))) return null;
  const presets = resolvePresets(applyInventory(p.options, inventory), p.presets);
  const mode = effectiveMode(p.designMode, presets);
  return {
    id: p.id,
    name: p.name,
    status: p.status,
    modelUrl: p.stlKey ? fileUrl(p.stlKey) : null,
    designModeLabel: `${DESIGN_MODE_LABEL[mode]}${mode !== p.designMode ? ` (set to "${p.designMode}", but no design can be shown yet)` : ""}.`,
    options: p.options,
    presets: presets.map((d) => ({ id: d.id, name: d.name, active: d.active, available: d.available, missing: d.missing, swatches: d.swatches, selection: d.selection })),
  };
}

export default async function ProductStudioPage({ searchParams }: { searchParams: Promise<{ draft?: string; product?: string }> }) {
  await connection(); // the model list cache reads the clock, which Cache Components forbids during prerender
  const { draft, product } = await searchParams;
  const [prefs, orKey, recent, images, list] = await Promise.all([
    getAiPrefs(),
    getAiKey("openrouter"),
    db.select({ id: aiDrafts.id, title: aiDrafts.title, status: aiDrafts.status, updatedAt: aiDrafts.updatedAt, payload: aiDrafts.payload }).from(aiDrafts).where(eq(aiDrafts.kind, "product")).orderBy(desc(aiDrafts.updatedAt)).limit(10),
    listImageModels(),
    adminListProducts(),
  ]);

  // a product's one chat, or a chat for a product that does not exist yet
  let d = product && UUID.test(product) ? await findProductChat(product) : draft && UUID.test(draft) ? await loadDraft(draft) : null;
  if (d && d.status !== "draft") d = null;
  const productId = (product && UUID.test(product) ? product : null) ?? d?.payload.productId ?? null;
  const panel = productId ? await productPanel(productId) : null;
  const current = d ? await snapshotOf(d) : null;
  const [gallery, photoCount] = productId ? await Promise.all([productGallery(productId), realPhotoCount(productId)]) : [[], 0];
  const products = list.filter((p) => !p.isService && !p.designer).map((p) => ({ id: p.id, name: p.name }));

  return (
    <div className="space-y-3">
      <PageHeader
        title="Product studio"
        description="One chat per product with a product partner: the listing, mockups, price, ready-made designs and options. Nothing changes in the shop until you approve it."
        actions={current || productId ? <Link className="text-sm underline" href="/admin/ai">New product</Link> : undefined}
      />
      {productId && !panel ? (
        <Panel title="This product cannot be used here"><p className="text-sm text-muted-foreground">It does not exist, or it is a clicker or keychain designer (those are set up in their own designer). <Link className="underline" href="/admin/ai">Start a new product</Link>.</p></Panel>
      ) : (
        <AiStudio key={`${current?.id ?? "new"}:${productId ?? ""}`} current={current} productId={productId} product={panel} products={products} ready={{ copy: Boolean(prefs.copyModel), imagesKey: Boolean(orKey) }} imageModels={images.ok ? images.models : []} defaultImageModel={prefs.imageModel} chatModel={prefs.copyModel ? `${PROVIDER_LABEL[prefs.copyProvider]} / ${prefs.copyModel}` : null} gallery={gallery} realPhotoCount={photoCount} />
      )}
      {recent.length > 0 && (
        <Panel title="Recent chats">
          <ul className="divide-y text-sm">
            {recent.map((r) => {
              const pid = (r.payload as { productId?: string | null }).productId;
              const href = pid ? `/admin/ai?product=${pid}` : `/admin/ai?draft=${r.id}`;
              return (
                <li key={r.id} className="flex items-center justify-between gap-3 py-1.5">
                  {r.status === "draft" ? <Link className="font-medium underline" href={href}>{r.title || "Untitled"}</Link> : <span>{r.title || "Untitled"}</span>}
                  <span className="text-xs text-muted-foreground">{pid ? "product · " : "new · "}{r.status === "draft" ? "open" : r.status} · {r.updatedAt.toLocaleDateString("en-PH")}</span>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </div>
  );
}
