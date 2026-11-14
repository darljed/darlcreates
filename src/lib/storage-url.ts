// Client-safe (no AWS SDK): the stable /api/files URL for a stored key.
/**
 * Stable, never-expiring URL for a public catalog file (product photo / STL).
 * Pure string — safe to embed in cached/prerendered pages. The route at
 * /api/files/[...key] signs a fresh short-lived S3 URL per request (gap G-03).
 */
export function fileUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  return `/api/files/${key.split("/").map(encodeURIComponent).join("/")}`;
}
