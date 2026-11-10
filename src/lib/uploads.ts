/**
 * Upload rules for admin file uploads. Pure (no I/O) so it can be unit-tested
 * and shared by the presign route and the Server Actions.
 */
export const UPLOAD_RULES = {
  stl: {
    exts: [".stl"],
    // Browsers report .stl as "", octet-stream or model/stl — we decide the
    // stored content type ourselves, so the client value isn't trusted.
    contentType: "model/stl",
    maxBytes: 50 * 1024 * 1024,
  },
  photo: {
    exts: [".jpg", ".jpeg", ".png", ".webp"],
    types: ["image/jpeg", "image/png", "image/webp"],
    maxBytes: 5 * 1024 * 1024,
  },
} as const;

export type AdminUploadKind = keyof typeof UPLOAD_RULES;

/** Returns an error message, or null if the upload is acceptable. */
export function validateUpload(
  kind: AdminUploadKind,
  filename: string,
  contentType: string,
  size: number,
): string | null {
  const rule = UPLOAD_RULES[kind];
  const lower = filename.toLowerCase();
  if (!rule.exts.some((e) => lower.endsWith(e))) {
    return `Unsupported file type. Allowed: ${rule.exts.join(", ")}`;
  }
  if (!Number.isFinite(size) || size <= 0) return "File is empty";
  if (size > rule.maxBytes) {
    return `File too large (max ${Math.round(rule.maxBytes / 1024 / 1024)} MB)`;
  }
  if (kind === "photo" && !UPLOAD_RULES.photo.types.some((t) => t === contentType)) {
    return "Photo must be JPEG, PNG or WebP";
  }
  return null;
}

/** The content type we sign and store for an upload. */
export function storedContentType(kind: AdminUploadKind, clientType: string) {
  return kind === "stl" ? UPLOAD_RULES.stl.contentType : clientType;
}

/** Key shape accepted for attaching an uploaded file to a product. */
export const KEY_PATTERNS = {
  stl: /^stl\/[A-Za-z0-9._-]+$/,
  photo: /^photos\/[A-Za-z0-9._-]+$/,
} as const;
