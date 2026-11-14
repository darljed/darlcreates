/**
 * Upload rules for admin file uploads. Pure (no I/O) so it can be unit-tested
 * and shared by the presign route, the Server Actions and the upload UI.
 *
 * A "model" is a print-ready 3D file: STL (single mesh) or 3MF (zipped XML; can
 * carry several parts and colors). The DB column is still called `stl_key` for
 * historical reasons; it holds either format.
 */
export const MODEL_EXTS = [".stl", ".3mf"] as const;

export const UPLOAD_RULES = {
  model: {
    exts: MODEL_EXTS,
    maxBytes: 50 * 1024 * 1024,
  },
  photo: {
    exts: [".jpg", ".jpeg", ".png", ".webp"],
    types: ["image/jpeg", "image/png", "image/webp"],
    maxBytes: 5 * 1024 * 1024,
  },
  // Landing-page hero image (admin only, publicly served from the site/ prefix).
  site: {
    exts: [".jpg", ".jpeg", ".png", ".webp"],
    types: ["image/jpeg", "image/png", "image/webp"],
    maxBytes: 5 * 1024 * 1024,
  },
  // Customer-supplied artwork for personalization. Any signed-in user may upload one.
  customer: {
    exts: [".jpg", ".jpeg", ".png", ".webp"],
    types: ["image/jpeg", "image/png", "image/webp"],
    maxBytes: 5 * 1024 * 1024,
  },
} as const;

export type RuleKind = keyof typeof UPLOAD_RULES;
export type AdminUploadKind = RuleKind; // existing imports
/** Kinds only an admin may upload. */
export const ADMIN_ONLY_KINDS: readonly RuleKind[] = ["model", "photo", "site"];
export type ModelFormat = "stl" | "3mf";

/** "stl" | "3mf" from a filename, key or URL (query/hash ignored). Defaults to stl. */
export function modelFormatOf(nameOrUrl: string): ModelFormat {
  const clean = nameOrUrl.split("#")[0].split("?")[0].toLowerCase();
  return clean.endsWith(".3mf") ? "3mf" : "stl";
}

/** Returns an error message, or null if the upload is acceptable. */
export function validateUpload(
  kind: AdminUploadKind,
  filename: string,
  contentType: string,
  size: number,
): string | null {
  const rule = UPLOAD_RULES[kind];
  const lower = filename.toLowerCase();
  if (!(rule.exts as readonly string[]).some((e) => lower.endsWith(e))) {
    return `Unsupported file type. Allowed: ${rule.exts.join(", ")}`;
  }
  if (!Number.isFinite(size) || size <= 0) return "File is empty";
  if (size > rule.maxBytes) {
    return `File too large (max ${Math.round(rule.maxBytes / 1024 / 1024)} MB)`;
  }
  if ((kind === "photo" || kind === "customer" || kind === "site") && !UPLOAD_RULES[kind].types.some((t) => t === contentType)) {
    return "Image must be JPEG, PNG or WebP";
  }
  return null;
}

/**
 * The content type we sign and store. For models we decide it from the extension:
 * browsers report .stl/.3mf as "", octet-stream or vendor types, so the client
 * value isn't trusted.
 */
export function storedContentType(kind: AdminUploadKind, filename: string, clientType: string) {
  if (kind === "model") return modelFormatOf(filename) === "3mf" ? "model/3mf" : "model/stl";
  return clientType;
}

/**
 * Key shape accepted for attaching an uploaded file to a product.
 * Models: new uploads go under `models/`; `stl/` is kept so existing products keep working.
 */
export const KEY_PATTERNS = {
  model: /^(stl|models)\/[A-Za-z0-9._-]+$/,
  photo: /^photos\/[A-Za-z0-9._-]+$/,
  site: /^site\/[A-Za-z0-9._-]+$/,
  /** customer/<userId>/<file>: the owner's id is part of the key. */
  customer: /^customer\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/,
} as const;

/** Prefix that every one of a user's customer uploads must start with. */
export function customerPrefix(userId: string): string {
  return `customer/${userId.replace(/[^A-Za-z0-9_-]/g, "_")}/`;
}

/** True only if `key` is a well-formed customer upload that belongs to `userId`. */
export function isOwnCustomerKey(userId: string, key: string): boolean {
  return KEY_PATTERNS.customer.test(key) && key.startsWith(customerPrefix(userId));
}

/**
 * Identify an image by its magic bytes (never by the filename or the client's content type).
 * Needs the first 12 bytes. Returns null for anything that isn't JPEG / PNG / WebP.
 */
export function sniffImageType(b: Uint8Array): "jpeg" | "png" | "webp" | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "png";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "webp";
  return null;
}

/** A 3MF is a ZIP: it must start with the local-file-header signature "PK\x03\x04". */
export function looksLikeZip(first4: Uint8Array): boolean {
  return first4.length >= 4 && first4[0] === 0x50 && first4[1] === 0x4b && first4[2] === 0x03 && first4[3] === 0x04;
}
