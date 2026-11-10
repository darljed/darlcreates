import { headObject, isStorageConfigured, peekBytes } from "./storage";
import { UPLOAD_RULES, isOwnCustomerKey, sniffImageType } from "./uploads";

/**
 * Server-side proof that a customer image is acceptable before it is attached to a cart/order:
 * the key belongs to this user, the object exists, is within the size limit, and its first bytes
 * are really a JPEG / PNG / WebP (the client's filename and content type are never trusted).
 */
export async function verifyCustomerImage(
  userId: string,
  key: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isOwnCustomerKey(userId, key)) return { ok: false, error: "That image isn't valid. Upload it again." };
  if (!isStorageConfigured()) return { ok: false, error: "Image uploads are unavailable right now." };
  const size = await headObject(key);
  if (size === null) return { ok: false, error: "We couldn't find your uploaded image. Upload it again." };
  if (size > UPLOAD_RULES.customer.maxBytes) return { ok: false, error: "Image is too large (max 5 MB)." };
  if (!sniffImageType(await peekBytes(key, 12))) {
    return { ok: false, error: "That file isn't a JPEG, PNG or WebP image." };
  }
  return { ok: true };
}
