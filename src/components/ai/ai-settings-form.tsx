"use client";

/** Admin → AI settings: a key per provider (write-only), the model that writes the copy, and a connection test. */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, KeyRound, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel } from "@/components/shell/ui";
import { selectClass } from "@/components/workshop/estimator-helpers";
import { listModelsAction, removeKeyAction, savePrefsAction, saveKeyAction, testConnectionAction } from "@/app/(admin)/admin/ai/settings/actions";
import type { ModelInfo } from "@/lib/ai/providers";
import type { KeyStatus, Provider } from "@/lib/ai/settings";

const LABEL: Record<Provider, string> = { openrouter: "OpenRouter", ollama: "Ollama Cloud" };
const HELP: Record<Provider, string> = {
  openrouter: "Text models and the image model. Get a key at openrouter.ai/keys.",
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

type Prefs = { copyProvider: Provider; copyModel: string; agentProvider: Provider; agentModel: string };

/** Provider + searchable model list. `needTools` hides nothing but marks models that cannot call tools. */
function ModelPicker({ id, provider, model, onChange, status, needTools }: { id: string; provider: Provider; model: string; onChange: (provider: Provider, model: string) => void; status: Record<Provider, KeyStatus>; needTools?: boolean }) {
  const [models, setModels] = useState<ModelInfo[] | null>(null);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [testing, start] = useTransition();

  async function load(p: Provider) {
    setLoading(true);
    setModels(null);
    const r = await listModelsAction({ provider: p });
    setLoading(false);
    if (r.ok) setModels(r.models); else toast.error(r.error);
  }
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (models ?? []).filter((m) => !q || m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)).slice(0, 300);
  }, [models, filter]);
  const picked = models?.find((m) => m.id === model);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor={`${id}-prov`}>Provider</Label>
          <select id={`${id}-prov`} className={selectClass + " w-48"} value={provider} onChange={(e) => { setModels(null); onChange(e.target.value as Provider, ""); }}>
            <option value="openrouter">OpenRouter</option>
            <option value="ollama">Ollama Cloud</option>
          </select>
        </div>
        <Button type="button" variant="outline" onClick={() => load(provider)} disabled={loading}>{loading && <Loader2 className="mr-2 size-4 animate-spin" />}{models ? "Reload models" : "Load models"}</Button>
        {!status[provider].configured && <p className="text-xs text-destructive">No key for {LABEL[provider]} yet.</p>}
      </div>
      {models && (
        <div className="space-y-2">
          <Input aria-label="Filter models" placeholder={`Filter ${models.length} models (name or id)`} value={filter} onChange={(e) => setFilter(e.target.value)} />
          <select size={8} aria-label="Models" className={selectClass + " h-52"} value={model} onChange={(e) => onChange(provider, e.target.value)}>
            {shown.filter((m) => !needTools || m.tools).map((m) => <option key={m.id} value={m.id}>{m.name}{m.vision ? " · sees images" : ""}{m.tools ? " · tools" : ""}{m.note ? ` · ${m.note}` : ""}</option>)}
          </select>
          {needTools && <p className="text-xs text-muted-foreground">Only models that can call tools are listed.</p>}
        </div>
      )}
      <p className="text-sm">Chosen: <span className="font-mono text-xs">{model ? `${LABEL[provider]} / ${model}` : "none"}</span>{picked && !picked.vision && !needTools && <span className="ml-2 text-xs text-muted-foreground">(text only: it will not read your photos)</span>}</p>
      <Button type="button" size="sm" variant="outline" disabled={testing || !model || !status[provider].configured} onClick={() => start(async () => { const r = await testConnectionAction({ provider, model }); if (r.ok) toast.success(r.message); else toast.error(r.error); })}>Test it</Button>
    </div>
  );
}

export function AiSettingsForm({ status, prefs, imageModel }: { status: Record<Provider, KeyStatus>; prefs: Prefs; imageModel: string }) {
  const [p, setP] = useState<Prefs>(prefs);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-4">
      <KeyCard provider="openrouter" status={status.openrouter} />
      <KeyCard provider="ollama" status={status.ollama} />

      <Panel title="Model for writing" description="Writes product copy in the AI studio. A model that can see pictures also reads your photos when it writes.">
        <ModelPicker id="copy" provider={p.copyProvider} model={p.copyModel} status={status} onChange={(provider, model) => setP((x) => ({ ...x, copyProvider: provider, copyModel: model }))} />
      </Panel>

      <Panel title="Model for the agent" description="The chat on every admin page (Ctrl/Cmd+J). It must be able to call tools. Leave empty to use the writing model.">
        <ModelPicker id="agent" needTools provider={p.agentProvider} model={p.agentModel} status={status} onChange={(provider, model) => setP((x) => ({ ...x, agentProvider: provider, agentModel: model }))} />
      </Panel>

      <div className="flex items-center gap-3">
        <Button disabled={pending || !p.copyModel} onClick={() => start(async () => { const r = await savePrefsAction(p); if (r.ok) toast.success(r.message); else toast.error(r.error); })}>{pending && <Loader2 className="mr-2 size-4 animate-spin" />}Save models</Button>
        <p className="text-xs text-muted-foreground">Saves both choices.</p>
      </div>

      <Panel title="Model for images" description="Fixed, so every product looks consistent.">
        <p className="text-sm"><span className="font-mono text-xs">OpenRouter / {imageModel}</span>: Google&apos;s image model that edits from your real photos and keeps the product&apos;s shape and colours. About $0.06 per image. Needs the OpenRouter key.</p>
      </Panel>
    </div>
  );
}
