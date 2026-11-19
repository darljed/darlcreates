"use client";

import { useId, useState } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Save (or update) an estimate: title, comment and tags, with the tags already in use offered as one-tap suggestions. The
 * parent mounts it with a fresh `key` each time it opens, so the fields start from `initial` without an effect.
 */
export interface EstimateMeta {
  title: string;
  comment: string;
  tags: string[];
}

export function SaveEstimateDialog({
  open,
  onOpenChange,
  updating,
  initial,
  knownTags,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** True when this will update the estimate being edited rather than add a new one. */
  updating: boolean;
  initial: EstimateMeta;
  knownTags: string[];
  /** Resolves true when saved (the dialog then closes); false keeps it open with what was typed. */
  onSave: (meta: EstimateMeta) => Promise<boolean>;
}) {
  const uid = useId();
  const [title, setTitle] = useState(initial.title);
  const [comment, setComment] = useState(initial.comment);
  const [tags, setTags] = useState<string[]>(initial.tags);
  const [tagInput, setTagInput] = useState("");
  const [busy, setBusy] = useState(false);

  const has = (list: string[], name: string) => list.some((t) => t.toLowerCase() === name.toLowerCase());
  const addTag = (raw: string) => {
    const name = raw.trim().replace(/,+$/, "").trim();
    if (name && !has(tags, name)) setTags([...tags, name]);
    setTagInput("");
  };

  const save = async () => {
    setBusy(true);
    // A half-typed tag is kept rather than dropped silently.
    const typed = tagInput.trim().replace(/,+$/, "").trim();
    const finalTags = typed && !has(tags, typed) ? [...tags, typed] : tags;
    const ok = await onSave({ title: title.trim(), comment: comment.trim(), tags: finalTags });
    setBusy(false);
    if (ok) onOpenChange(false);
  };

  const suggestions = knownTags.filter((t) => !has(tags, t)).slice(0, 8);

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{updating ? "Update estimate" : "Save estimate"}</DialogTitle>
          <DialogDescription>Keeps the job, settings, parts, fees, margins, selected price and the three tier prices, so it can be reopened and edited.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor={`${uid}-title`}>Title (optional)</Label>
            <Input id={`${uid}-title`} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Keychains x4 for Ana" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${uid}-comment`}>Comment (optional)</Label>
            <Textarea id={`${uid}-comment`} value={comment} maxLength={2000} onChange={(e) => setComment(e.target.value)} placeholder="Notes about this job…" rows={3} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${uid}-tags`}>Tags</Label>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <Badge key={t} variant="secondary" className="gap-1">
                    {t}
                    <button type="button" aria-label={`Remove tag ${t}`} className="text-muted-foreground hover:text-foreground" onClick={() => setTags(tags.filter((x) => x !== t))}>
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <Input
              id={`${uid}-tags`}
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addTag(tagInput);
                }
              }}
              placeholder="Type a tag, press Enter"
            />
            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((t) => (
                  <button key={t} type="button" className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent" onClick={() => addTag(t)}>
                    + {t}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : updating ? "Update" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
