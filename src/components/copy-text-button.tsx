"use client";

/** Copies a text to the clipboard (hidden when printing). */
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CopyTextButton({ text, label = "Copy as text" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button type="button" variant="outline" size="sm" className="print:hidden" onClick={async () => { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }}>
      {done ? <Check className="mr-1 size-4" /> : <Copy className="mr-1 size-4" />} {done ? "Copied" : label}
    </Button>
  );
}
