"use client";

/**
 * After a customer picks a picture (when the owner has AI redraw on): how should it become a design? Three cards, each
 * with a before / after example: keep it as it is (traced, instant), flat colours (AI), or a 2-colour portrait (AI).
 * The AI cards need a signed-in customer.
 */
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export type PictureMode = "trace" | "flat" | "stencil";

const CARDS: { mode: PictureMode; title: string; text: string; note: string; example: string; alt: string }[] = [
  { mode: "trace", title: "Keep my picture", text: "Traced as it is. Best for logos and simple pictures.", note: "Instant", example: "/clicker-examples/trace.jpg", alt: "A simple logo and the same logo traced into print colours" },
  { mode: "flat", title: "Flat colours", text: "An AI redraws it with a few solid colours that we have in stock.", note: "AI, about 15 seconds", example: "/clicker-examples/flat.jpg", alt: "A photo of a cat and the same cat redrawn in three flat colours" },
  { mode: "stencil", title: "2-colour portrait", text: "An AI redraws it in two tones. Best for faces and pets.", note: "AI, about 15 seconds", example: "/clicker-examples/stencil.jpg", alt: "A photo of a person and the same person redrawn in black and white" },
];

export function PictureModeChooser({ fileName, signedIn, busy, onPick, onCancel }: { fileName: string; signedIn: boolean; busy: boolean; onPick: (m: PictureMode) => void; onCancel: () => void }) {
  const pathname = usePathname();
  return (
    <div className="space-y-3 rounded-lg border-2 border-primary/30 bg-primary/5 p-3" role="group" aria-label="How should we use your picture?">
      <p className="text-sm font-bold">How should we use “{fileName}”?</p>
      <ul className="grid gap-2">
        {CARDS.map((c) => {
          const ai = c.mode !== "trace";
          const locked = ai && !signedIn;
          return (
            <li key={c.mode} className="overflow-hidden rounded-lg border bg-background">
              <Image src={c.example} alt={c.alt} width={600} height={300} className="h-auto w-full" />
              <div className="flex items-center gap-2 p-2">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 text-sm font-semibold">
                    {ai && <Sparkles className="size-3.5 text-primary" aria-hidden />} {c.title}
                  </p>
                  <p className="text-xs text-muted-foreground">{c.text}</p>
                  <p className="text-[11px] font-medium text-muted-foreground">{locked ? <>Sign in to use this. <Link href={`/sign-in?redirect=${encodeURIComponent(pathname)}`} className="underline">Sign in</Link></> : c.note}</p>
                </div>
                <Button type="button" size="sm" disabled={busy || locked} onClick={() => onPick(c.mode)}>
                  {busy ? <Loader2 className="size-4 animate-spin" aria-label="Working" /> : "Use"}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-muted-foreground">The AI options send your picture to an AI service to redraw it. {busy && "Redrawing… please wait."}</p>
      <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onCancel}>Cancel</Button>
    </div>
  );
}
