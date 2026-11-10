"use client";

import { useCallback, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LegalEditor, type LegalMeta } from "@/components/admin/legal-editor";
import type { LegalDoc, LegalSlug } from "@/lib/site-content-schema";

type Doc = { doc: LegalDoc; meta: LegalMeta };

/** Privacy and Terms as tabs. Both editors stay mounted, so unsaved text survives switching tabs. */
export function LegalWorkspace({
  privacy,
  terms,
  acceptance,
}: {
  privacy: Doc;
  terms: Doc;
  acceptance: { accepted: number; total: number };
}) {
  const [dirty, setDirty] = useState<Record<LegalSlug, boolean>>({ privacy: false, terms: false });
  const onPrivacy = useCallback((v: boolean) => setDirty((p) => (p.privacy === v ? p : { ...p, privacy: v })), []);
  const onTerms = useCallback((v: boolean) => setDirty((p) => (p.terms === v ? p : { ...p, terms: v })), []);

  const trigger = (slug: LegalSlug, text: string) => (
    <TabsTrigger value={slug} className="gap-1.5">
      {text}
      {dirty[slug] && <span className="size-2 rounded-full bg-amber-500" role="img" aria-label="unsaved changes" />}
    </TabsTrigger>
  );

  return (
    <Tabs defaultValue="privacy">
      <TabsList variant="line" className="border-b">
        {trigger("privacy", "Privacy Policy")}
        {trigger("terms", "Terms and Conditions")}
      </TabsList>
      <TabsContent value="privacy" forceMount className="pt-3 data-[state=inactive]:hidden">
        <LegalEditor slug="privacy" initial={privacy.doc} meta={privacy.meta} acceptance={acceptance} onDirtyChange={onPrivacy} />
      </TabsContent>
      <TabsContent value="terms" forceMount className="pt-3 data-[state=inactive]:hidden">
        <LegalEditor slug="terms" initial={terms.doc} meta={terms.meta} onDirtyChange={onTerms} />
      </TabsContent>
    </Tabs>
  );
}
