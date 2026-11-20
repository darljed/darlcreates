/**
 * Encrypts the AI provider keys before they go in the database (AES-256-GCM). The key is derived from AI_SETTINGS_SECRET,
 * or BETTER_AUTH_SECRET when that is not set. Changing the secret makes saved keys unreadable (enter them again).
 * Framework-free, so scripts can use it.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

let derived: { secret: string; key: Buffer } | null = null;
/** scrypt (slow on purpose) with a fixed application salt; the result is kept for the life of the process. */
function secretKey(): Buffer {
  const s = process.env.AI_SETTINGS_SECRET || process.env.BETTER_AUTH_SECRET;
  if (!s || s === "change-me") throw new Error("Set AI_SETTINGS_SECRET (or BETTER_AUTH_SECRET) before saving AI keys.");
  if (derived?.secret !== s) derived = { secret: s, key: scryptSync(s, "darlcreates-ai-settings-v2", 32) };
  return derived.key;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", secretKey(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v2", iv.toString("base64"), c.getAuthTag().toString("base64"), ct.toString("base64")].join(":");
}

/** The plain text, or null when it cannot be read (wrong secret, damaged value). */
export function decryptSecret(stored: string): string | null {
  try {
    const [v, iv, tag, ct] = stored.split(":");
    if (v !== "v2") return null;
    const d = createDecipheriv("aes-256-gcm", secretKey(), Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
