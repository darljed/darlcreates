"use client";

/**
 * Font choice as buttons, each showing the customer's own name (or a sample) in that font, so they pick the look they
 * like instead of a name in a list. The faces are loaded by the browser from /fonts (see `@font-face` in globals.css) the
 * first time a button is shown.
 */
import { NAME_FONTS, type NameFontId } from "@/lib/name-mesh";
import { cn } from "@/lib/utils";

/** CSS font-family of a name font (declared in globals.css). */
export const fontFamilyOf = (id: NameFontId) => `"dc-name-${id}"`;

export function FontPicker({
  fonts,
  value,
  onChange,
  sample,
  label = "Font",
  className,
}: {
  fonts: NameFontId[];
  value: NameFontId;
  onChange: (id: NameFontId) => void;
  /** What each button shows. Empty: "Aa". */
  sample?: string;
  label?: string;
  className?: string;
}) {
  const text = sample?.trim() || "Aa";
  return (
    <div role="group" aria-label={label} className={cn("space-y-1.5", className)}>
      <p className="text-xs font-semibold">{label}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {fonts.map((id) => {
          const on = id === value;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              aria-label={`${NAME_FONTS[id].label} font`}
              onClick={() => onChange(id)}
              className={cn(
                "flex min-w-0 flex-col items-start gap-0.5 rounded-lg border-2 px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on ? "border-primary bg-primary/10" : "border-border bg-background hover:border-primary",
              )}
            >
              <span className="block max-w-full truncate text-2xl leading-tight" style={{ fontFamily: `${fontFamilyOf(id)}, ui-sans-serif, system-ui, sans-serif` }}>
                {text}
              </span>
              <span className="text-[11px] font-semibold text-muted-foreground">{NAME_FONTS[id].label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
