"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Settings as SettingsIcon } from "lucide-react";
import { toast } from "sonner";
import { deleteEstimateAction, listEstimatesAction, saveEstimateAction, updateEstimateAction } from "@/app/(admin)/admin/estimator/actions";
import { Panel } from "@/components/shell/ui";
import { Button } from "@/components/ui/button";
import { DEFAULT_SETTINGS, computeCost, priceTiers, type Component, type LineItem, type Settings } from "@/lib/workshop/pricing";
import { TIER_LABELS } from "@/lib/workshop/presets";
import type { EstimateInput, JobFormState, SavedEstimate } from "@/lib/workshop/types";
import { ComponentsList } from "./components-list";
import { CostBreakdown } from "./cost-breakdown";
import {
  buildJob,
  buildProductDraft,
  emptyJob,
  isValidJob,
  peso,
  restoreEstimate,
  restoreSettings,
  settingsSnapshot,
  type FilamentOption,
  type ProductDraft,
} from "./estimator-helpers";
import { JobForm } from "./job-form";
import { LineItemsList } from "./line-items-list";
import { PriceTiers } from "./price-tiers";
import { SaveEstimateDialog, type EstimateMeta } from "./save-estimate-dialog";
import { SaveProductDialog } from "./save-product-dialog";
import { SavedEstimatesList } from "./saved-estimates-list";
import { SettingsPanel } from "./settings-panel";

/** One inventory part the estimator can use as a material or component. `unitPricePesos` is the weighted-average cost of ONE unit (g, piece...) in pesos. */
export type EstimatorPart = { id: string; name: string; unit: string; category: string | null; unitPricePesos: number };

/**
 * The admin price estimator: live cost and three price tiers for a job, saved estimates (edit, delete, filter by tag), and
 * "save as product" (a draft shop product, or costing for an existing one). Ported from the internal 3dEstimator app; the maths
 * is `@/lib/workshop/pricing`. The owner's settings persist in localStorage, except while a saved estimate is open for
 * editing (its own settings are borrowed for the maths and the owner's are restored on Cancel).
 */

const SETTINGS_KEY = "workshop.estimator.settings.v1";
const NO_OVERRIDES: [number | null, number | null, number | null] = [null, null, null];
const NEW_META: EstimateMeta = { title: "", comment: "", tags: [] };

export function EstimatorClient({
  parts,
  initialEstimates,
  initialTags,
  products,
}: {
  parts: EstimatorPart[];
  initialEstimates: SavedEstimate[];
  initialTags: string[];
  products: { id: string; name: string }[];
}) {
  const [job, setJob] = useState<JobFormState>(emptyJob);
  const [components, setComponents] = useState<Component[]>([]);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  // Per-tier margin overrides from the sliders (session only). null = the settings' margin for that tier.
  const [overrides, setOverrides] = useState<[number | null, number | null, number | null]>(NO_OVERRIDES);
  const [selectedTier, setSelectedTier] = useState(1);
  const [editing, setEditing] = useState<{ id: string; meta: EstimateMeta } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveKey, setSaveKey] = useState(0);
  const [productDraft, setProductDraft] = useState<ProductDraft | null>(null);
  const [productKey, setProductKey] = useState(0);
  const [estimates, setEstimates] = useState(initialEstimates);
  const [allTags, setAllTags] = useState(initialTags);
  const [filter, setFilter] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  // The owner's own settings, parked while a saved estimate is open for editing.
  const stashed = useRef<Settings | null>(null);
  const requestSeq = useRef(0);
  const topRef = useRef<HTMLDivElement>(null);

  // localStorage only exists in the browser, so the saved settings are read after mount (reading during render would mismatch the server HTML).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrating from localStorage once, after the first render
      if (raw) setSettings(restoreSettings(JSON.parse(raw)));
    } catch {
      /* corrupt or blocked storage: keep the defaults */
    }
  }, []);

  /** The settings panel's change handler: also persists, but never while a saved estimate's own settings are on screen. */
  const changeSettings = (next: Settings) => {
    setSettings(next);
    if (editing) return;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {
      /* storage full or blocked: the settings still apply to this session */
    }
  };

  const filaments = useMemo<FilamentOption[]>(() => {
    const grams = parts.filter((p) => p.unit === "g");
    const tracked = grams.filter((p) => /filament/i.test(p.category ?? ""));
    return (tracked.length > 0 ? tracked : grams).map((p) => ({ id: p.id, name: p.name, pricePerKg: p.unitPricePesos * 1000 }));
  }, [parts]);

  const activeMargins = useMemo<[number, number, number]>(
    () => [overrides[0] ?? settings.margins[0], overrides[1] ?? settings.margins[1], overrides[2] ?? settings.margins[2]],
    [overrides, settings.margins],
  );
  const parsedJob = useMemo(() => buildJob(job, components, lineItems), [job, components, lineItems]);
  const cost = useMemo(() => computeCost(parsedJob, settings), [parsedJob, settings]);
  const tiers = useMemo(
    () => priceTiers(cost.totalCost, activeMargins, parsedJob.quantity, { roundingStep: settings.roundingStep, passThrough: cost.passThroughLineItems }),
    [cost.totalCost, cost.passThroughLineItems, activeMargins, parsedJob.quantity, settings.roundingStep],
  );
  const valid = isValidJob(parsedJob);

  const setTierMargin = (index: number, margin: number) =>
    setOverrides((prev) => {
      const next: [number | null, number | null, number | null] = [prev[0], prev[1], prev[2]];
      next[index] = margin;
      return next;
    });

  // ── Saved estimates ────────────────────────────────────────────────────────────────────────────────────────────

  /** Reload the list (and the tags in use) from the server for a tag filter. A slow, older answer never overwrites a newer one. */
  const refresh = async (tags: string[]) => {
    const seq = ++requestSeq.current;
    setLoading(true);
    const res = await listEstimatesAction(tags);
    if (seq !== requestSeq.current) return;
    setLoading(false);
    if (!res.ok) return void toast.error(res.error);
    setEstimates(res.estimates);
    setAllTags(res.tags);
  };

  const toggleTag = (tag: string) => {
    const next = filter.includes(tag) ? filter.filter((t) => t !== tag) : [...filter, tag];
    setFilter(next);
    void refresh(next);
  };
  const clearFilter = () => {
    setFilter([]);
    void refresh([]);
  };

  const openSave = () => {
    setSaveKey((k) => k + 1);
    setSaveOpen(true);
  };

  const handleSave = async (meta: EstimateMeta): Promise<boolean> => {
    const input: EstimateInput = {
      job,
      settings: settingsSnapshot(settings),
      components,
      lineItems,
      margins: activeMargins,
      selectedTier,
    };
    const payload = {
      title: meta.title,
      comment: meta.comment,
      input,
      tiers,
      totalCostPesos: cost.totalCost,
      // The selected tier's rounded price for the whole quantity.
      pricePesos: tiers[selectedTier].rounded,
      quantity: parsedJob.quantity,
      tags: meta.tags,
    };
    const res = editing ? await updateEstimateAction(editing.id, payload) : await saveEstimateAction(payload);
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    if (editing) setEditing({ id: editing.id, meta });
    toast.success(editing ? "Estimate updated" : "Estimate saved");
    void refresh(filter);
    return true;
  };

  /** Put a saved estimate back into the estimator: job, its own settings, parts, fees, margins and the selected tier. */
  const editEstimate = (e: SavedEstimate) => {
    const r = restoreEstimate(e.input);
    if (!stashed.current) stashed.current = settings;
    setJob(r.job);
    setSettings(r.settings);
    setComponents(r.components);
    setLineItems(r.lineItems);
    // Only margins that differ from the snapshot's own are overrides; the others follow the settings.
    setOverrides([0, 1, 2].map((i) => (Math.abs(r.margins[i] - r.settings.margins[i]) > 1e-9 ? r.margins[i] : null)) as [number | null, number | null, number | null]);
    setSelectedTier(r.selectedTier);
    setEditing({ id: e.id, meta: { title: e.title ?? "", comment: e.comment ?? "", tags: e.tags } });
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    toast.info(`Editing “${e.title || "Untitled estimate"}”. Save to update it.`);
  };

  const cancelEdit = () => {
    if (stashed.current) {
      setSettings(stashed.current);
      stashed.current = null;
    }
    setEditing(null);
    toast.message("Stopped editing. Your settings are back, and Save will create a new estimate.");
  };

  const deleteEstimate = async (e: SavedEstimate) => {
    const res = await deleteEstimateAction(e.id);
    if (!res.ok) return void toast.error(res.error);
    toast.success("Estimate deleted");
    // The estimate being edited is gone: leave edit mode so Save does not try to update it.
    if (editing?.id === e.id) cancelEdit();
    void refresh(filter);
  };

  // ── Save as product ────────────────────────────────────────────────────────────────────────────────────────────

  const openProduct = (draft: ProductDraft) => {
    setProductKey((k) => k + 1);
    setProductDraft(draft);
  };

  const productFromSaved = (e: SavedEstimate) => {
    const r = restoreEstimate(e.input);
    openProduct(buildProductDraft(buildJob(r.job, r.components, r.lineItems), r.settings, r.margins, r.selectedTier, e.title ?? ""));
  };

  return (
    <div ref={topRef} className="scroll-mt-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Machine time is billed at <strong className="text-foreground">{peso(cost.machineHourRate)}/hr</strong>. Settings are saved in this browser.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
          <SettingsIcon /> Settings
        </Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
        <Panel title="Job" bodyClassName="space-y-4">
          <JobForm job={job} onChange={setJob} filaments={filaments} />
          <div className="border-t pt-4">
            <ComponentsList components={components} onChange={setComponents} parts={parts} />
          </div>
          <div className="border-t pt-4">
            <LineItemsList items={lineItems} onChange={setLineItems} />
          </div>
        </Panel>

        <div className="space-y-3">
          <CostBreakdown cost={cost} quantity={parsedJob.quantity} mode={parsedJob.quantityMode ?? "per-unit"} />
          <PriceTiers
            tiers={tiers}
            quantity={parsedJob.quantity}
            margins={activeMargins}
            defaultMargins={settings.margins}
            selectedIndex={selectedTier}
            onSelect={setSelectedTier}
            onMarginChange={setTierMargin}
            onResetMargins={() => setOverrides(NO_OVERRIDES)}
          />
          {editing && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
              <span>Editing “{editing.meta.title || "Untitled estimate"}”. Save will update it.</span>
              <button type="button" className="underline underline-offset-2" onClick={cancelEdit}>
                Cancel edit
              </button>
            </div>
          )}
          {!valid && <p className="text-xs text-muted-foreground">Enter the grams of at least one filament row, and a price for every row that has grams, to save.</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" onClick={openSave} disabled={!valid}>
              {editing ? "Update estimate" : "Save estimate"}
            </Button>
            <Button type="button" variant="outline" disabled={!valid} onClick={() => openProduct(buildProductDraft(parsedJob, settings, activeMargins, selectedTier))}>
              Save as product ({TIER_LABELS[selectedTier]}) →
            </Button>
          </div>
        </div>
      </div>

      <SavedEstimatesList
        estimates={estimates}
        allTags={allTags}
        filter={filter}
        loading={loading}
        editingId={editing?.id ?? null}
        onToggleTag={toggleTag}
        onClearFilter={clearFilter}
        onEdit={editEstimate}
        onCreateProduct={productFromSaved}
        onDelete={deleteEstimate}
      />

      <SettingsPanel settings={settings} onChange={changeSettings} open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <SaveEstimateDialog
        key={`save-${saveKey}`}
        open={saveOpen}
        onOpenChange={setSaveOpen}
        updating={editing != null}
        initial={editing?.meta ?? NEW_META}
        knownTags={allTags}
        onSave={handleSave}
      />
      {productDraft && <SaveProductDialog key={`product-${productKey}`} draft={productDraft} products={products} onClose={() => setProductDraft(null)} />}
    </div>
  );
}
