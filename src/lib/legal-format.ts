import { isSafeHref } from "./site-content-schema";

/**
 * Pure text-editing helpers for the legal-page editor toolbar. Each takes the textarea value and the
 * selection and returns the new value and selection, so the logic is testable without a browser.
 */
export type Edit = { value: string; start: number; end: number };

function lineBounds(value: string, start: number, end: number) {
  const from = value.lastIndexOf("\n", start - 1) + 1;
  const nl = value.indexOf("\n", end);
  return { from, to: nl === -1 ? value.length : nl };
}

/** Turn the line at the cursor into a "## " heading, or back into a normal line. */
export function toggleHeading(value: string, start: number, end: number): Edit {
  const { from, to } = lineBounds(value, start, start);
  const line = value.slice(from, to);
  if (line.startsWith("## ")) {
    return { value: value.slice(0, from) + line.slice(3) + value.slice(to), start: Math.max(from, start - 3), end: Math.max(from, end - 3) };
  }
  return { value: value.slice(0, from) + "## " + line + value.slice(to), start: start + 3, end: end + 3 };
}

/** Make every selected line a "- " bullet, or remove the bullets if they all already are. */
export function toggleBullets(value: string, start: number, end: number): Edit {
  const { from, to } = lineBounds(value, start, end);
  const lines = value.slice(from, to).split("\n");
  const all = lines.every((l) => !l.trim() || l.startsWith("- "));
  const next = lines.map((l) => (!l.trim() ? l : all ? l.slice(2) : l.startsWith("- ") ? l : `- ${l}`));
  const out = next.join("\n");
  return { value: value.slice(0, from) + out + value.slice(to), start: from, end: from + out.length };
}

export type LinkResult = ({ ok: true } & Edit) | { ok: false; error: string };

/** Replace the selection with [label](url). The url must pass the same safety check the page uses. */
export function insertLink(value: string, start: number, end: number, label: string, url: string): LinkResult {
  const u = url.trim();
  if (!isSafeHref(u)) return { ok: false, error: "Use a path (/products), an https:// link, mailto: or tel:" };
  const text = (label.trim() || value.slice(start, end) || "link").replace(/[\[\]\n]/g, " ").trim();
  const md = `[${text}](${u})`;
  return { ok: true, value: value.slice(0, start) + md + value.slice(end), start, end: start + md.length };
}

/** Headings in order, for a quick outline and the "n sections" count. */
export function outline(body: string): string[] {
  return body
    .split(/\r?\n/)
    .filter((l) => l.startsWith("## "))
    .map((l) => l.slice(3).trim());
}

/** Words in the body, ignoring markup characters. */
export function wordCount(body: string): number {
  return (body.replace(/[#\-\[\]()]/g, " ").match(/\S+/g) ?? []).length;
}
