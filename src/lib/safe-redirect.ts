/**
 * Validate a post-login redirect target. Only same-site relative paths are allowed, so a
 * crafted `?redirect=https://evil.example` or `//evil.example` can't bounce users off-site
 * (open redirect). Anything else falls back to `fallback`.
 */
export function safeRedirect(input: string | null | undefined, fallback = "/"): string {
  if (!input) return fallback;
  let v = input.trim();
  try {
    v = decodeURIComponent(v);
  } catch {
    return fallback;
  }
  if (!v.startsWith("/")) return fallback; // not a path (also rejects "https:", "javascript:")
  if (v.startsWith("//") || v.startsWith("/\\")) return fallback; // protocol-relative
  if (/[\u0000-\u001f\u007f\\]/.test(v)) return fallback; // control chars / backslashes
  return v;
}
