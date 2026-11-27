"use client";

/** Admin → AI settings: a key per provider (write-only), the models that write and draw, and a connection test. */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, KeyRound, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel } from "@/components/shell/ui";
import { selectClass } from "@/components/workshop/estimator-helpers";
import { listImageModelsAction, listModelsAction, removeKeyAction, savePrefsAction, saveKeyAction, testConnectionAction } from "@/app/(admin)/admin/ai/settings/actions";
import type { ModelInfo } from "@/lib/ai/providers";
import type { KeyStatus, Provider } from "@/lib/ai/settings";

const LABEL: Record<Provider, string> = { openrouter: "OpenRouter", ollama: "Ollama Cloud" };
const HELP: Record<Provider, string> = {
  openrouter: "Text models and the image models. Get a key at openrouter.ai/keys.",
  ollama: "Text models only. Get a key at ollama.com/settings/keys.",
};

function KeyCard({ provider, status }: { provider: Provider; status: KeyStatus }) {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) { toast.success(r.message ?? "Done"); setKey(""); router.refresh(); } else toast.error(r.error ?? "Failed");
    });
  return (
    <Panel title={LABEL[provider]} description={HELP[provider]}>
      <div className="space-y-3">
        <p className="text-sm">
          {status.configured ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-green-700"><Check className="size-4" /> Key set ({status.source === "saved" ? "saved here" : "from the server environment"}, ends in {status.last4})</span>
          ) : (
            <span className="text-muted-foreground">No key yet.</span>
          )}
          {status.unreadable && <span className="ml-2 text-destructive">A saved key could not be decrypted (the secret changed). Enter it again.</span>}
        </p>
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (key.trim()) run(() => saveKeyAction({ provider, key })); }}>
          <div className="min-w-64 flex-1 space-y-1">
            <Label htmlFor={`key-${provider}`}>{status.configured ? "Replace key" : "API key"}</Label>
            <Input id={`key-${provider}`} type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste the key. It is encrypted and never shown again." />
          </div>
          <Button type="submit" disabled={pending || !key.trim()}>{pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <KeyRound className="mr-2 size-4" />}Save key</Button>
          {status.source === "saved" && <Button type="button" variant="outline" disabled={pending} onClick={() => run(() => removeKeyAction({ provider }))}><Trash2 className="mr-2 size-4" />Remove</Button>}
        </form>
      </div>
    </Panel>
  );
}

type Prefs = { copyProvider: Provider; copyModel: string; agentProvider: Provider; agentModel: string; imageModel: string };

/**
 * Provider + searchable model list. `needTools` hides nothing but marks models that cannot call tools. `images` makes it the
 * image-model picker (OpenRouter only, no test button). The model in use is pinned to the top and marked ACTIVE.
 */
function ModelPicker({ id, provider, model, onChange, status, needTools, images, defaultModel }: { id: string; provider: Provider; model: string; onChange: (provider: Provider, model: string) => void; status: Record<Provider, KeyStatus>; needTools?: boolean; images?: boolean; defaultModel?: string }) {
  const [models, setModels] = useState<ModelInfo[] | null>(null);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [testing, start] = useTransition();

  async function load(p: Provider) {
    setLoading(true);
    setModels(null);
    const r = await (images ? listImageModelsAction() : listModelsAction({ provider: p }));
    setLoading(false);
    if (r.ok) setModels(r.models); else toast.error(r.error);
  }
  const { active, rest } = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const usable = (models ?? []).filter((m) => !needTools || m.tools);
    const active = usable.find((m) => m.id === model) ?? null;
    // the active model stays in view whatever the filter says
    const rest = usable.filter((m) => m.id !== model && (!q || m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))).slice(0, 300);
    return { active, rest };
  }, [models, filter, model, needTools]);
  const picked = models?.find((m) => m.id === model);
  const label = (m: ModelInfo) => [m.name, images ? (m.vision ? "uses your photo" : "no photo input (cannot redraw your product)") : m.vision ? "sees images" : "", m.tools && !images ? "tools" : "", m.note, m.id === defaultModel ? "default" : ""].filter(Boolean).join(" · ");
  const prov = images ? "openrouter" : provider;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        {!images && (
          <div className="space-y-1">
            <Label htmlFor={`${id}-prov`}>Provider</Label>
            <select id={`${id}-prov`} className={selectClass + " w-48"} value={provider} onChange={(e) => { setModels(null); onChange(e.target.value as Provider, ""); }}>
              <option value="openrouter">OpenRouter</option>
              <option value="ollama">Ollama Cloud</option>
            </select>
          </div>
        )}
        <Button type="button" variant="outline" onClick={() => load(provider)} disabled={loading}>{loading && <Loader2 className="mr-2 size-4 animate-spin" />}{models ? "Reload models" : "Load models"}</Button>
        {!status[prov].configured && <p className="text-xs text-destructive">No key for {LABEL[prov]} yet.</p>}
      </div>
      {models && (
        <div className="space-y-2">
          <Input aria-label="Filter models" placeholder={`Filter ${models.length} models (name or id)`} value={filter} onChange={(e) => setFilter(e.target.value)} />
          <select size={8} aria-label="Models" className={selectClass + " h-52"} value={model} onChange={(e) => onChange(provider, e.target.value)}>
            {active && <option value={active.id}>✓ ACTIVE · {label(active)}</option>}
            {!active && model && <option value={model}>✓ ACTIVE · {model} (not in this list)</option>}
            {rest.map((m) => <option key={m.id} value={m.id}>{label(m)}</option>)}
          </select>
          {needTools && <p className="text-xs text-muted-foreground">Only models that can call tools are listed.</p>}
        </div>
      )}
      <p className="text-sm">Chosen: <span className="font-mono text-xs">{model ? `${LABEL[prov]} / ${model}` : "none"}</span>{picked && !picked.vision && !images && <span className="ml-2 text-xs text-muted-foreground">(text only: it will not read your photos)</span>}{picked && images && !picked.vision && <span className="ml-2 text-xs text-destructive">(cannot take your photo as input, so it cannot redraw your real product)</span>}</p>
      {!images && <Button type="button" size="sm" variant="outline" disabled={testing || !model || !status[provider].configured} onClick={() => start(async () => { const r = await testConnectionAction({ provider, model }); if (r.ok) toast.success(r.message); else toast.error(r.error); })}>Test it</Button>}
    </div>
  );
}

export function AiSettingsForm({ status, prefs, defaultImageModel }: { status: Record<Provider, KeyStatus>; prefs: Prefs; defaultImageModel: string }) {
  const [p, setP] = useState<Prefs>(prefs);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-4">
      <KeyCard provider="openrouter" status={status.openrouter} />
      <KeyCard provider="ollama" status={status.ollama} />

      <Panel title="Model for writing" description="The Product studio chat (listing, designs, pricing). It must be able to call tools. A model that can see pictures also reads your photos.">
        <ModelPicker id="copy" needTools provider={p.copyProvider} model={p.copyModel} status={status} onChange={(provider, model) => setP((x) => ({ ...x, copyProvider: provider, copyModel: model }))} />
      </Panel>

      <Panel title="Model for the agent" description="The chat on every admin page (Ctrl/Cmd+J). It must be able to call tools. Leave empty to use the writing model.">
        <ModelPicker id="agent" needTools provider={p.agentProvider} model={p.agentModel} status={status} onChange={(provider, model) => setP((x) => ({ ...x, agentProvider: provider, agentModel: model }))} />
      </Panel>


      <Panel title="Model for images" description="Makes the mockups in the Product studio from your real photos. It must be able to take a photo as input. The studio's message box can switch to another image model for any message.">
        <ModelPicker id="image" images provider="openrouter" model={p.imageModel} status={status} defaultModel={defaultImageModel} onChange={(_provider, model) => setP((x) => ({ ...x, imageModel: model }))} />
        {p.imageModel !== defaultImageModel && <Button type="button" size="sm" variant="ghost" className="mt-2" onClick={() => setP((x) => ({ ...x, imageModel: defaultImageModel }))}>Back to the default ({defaultImageModel})</Button>}
        <p className="mt-2 text-xs text-muted-foreground">Needs the OpenRouter key. The default makes about $0.06 per image. The real cost of each picture is shown in the studio. Press Save models to keep the change.</p>
      </Panel>

      <div className="flex items-center gap-3">
        <Button disabled={pending || !p.copyModel} onClick={() => start(async () => { const r = await savePrefsAction(p); if (r.ok) toast.success(r.message); else toast.error(r.error); })}>{pending && <Loader2 className="mr-2 size-4 animate-spin" />}Save models</Button>
        <p className="text-xs text-muted-foreground">Saves the writing, agent and image models.</p>
      </div>
    </div>
  );
}
