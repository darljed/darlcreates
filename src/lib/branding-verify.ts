import { checkLogo, LOGO_KEY_PATTERN, LOGO_SPECS, type LogoAsset, type LogoSlot } from "./branding-schema";
import { imageSize } from "./image-size";
import { deleteObject, headObject, peekBytes } from "./storage";

/**
 * Server-side proof that an uploaded logo is acceptable for its slot: the key is a site/ key, the object exists,
 * is within the size limit, is really a PNG/JPEG/WebP (magic bytes, never the filename or the browser's claim),
 * and its pixel size and shape fit the slot. The size we store comes from the file, not from the browser.
 * A rejected upload is deleted so it doesn't linger in the bucket.
 */
export async function verifyLogoUpload(
  slot: LogoSlot,
  key: string,
): Promise<{ ok: true; asset: LogoAsset } | { ok: false; error: string }> {
  if (!LOGO_KEY_PATTERN.test(key)) return { ok: false, error: "Invalid file." };
  const bytes = await headObject(key);
  if (bytes === null) return { ok: false, error: "Uploaded image not found. Upload it again." };

  const reject = async (error: string) => {
    await deleteObject(key).catch(() => undefined);
    return { ok: false as const, error: `${LOGO_SPECS[slot].label}: ${error}` };
  };

  // 256 KB is far more than a PNG/WebP header needs and enough for a JPEG to reach its frame header.
  const head = await peekBytes(key, Math.min(bytes, 256 * 1024));
  const info = imageSize(head);
  if (!info) return reject("that file isn't a readable PNG, JPEG or WebP image.");

  const problem = checkLogo(slot, { width: info.width, height: info.height, bytes, type: info.type });
  if (problem) return reject(problem);
  return { ok: true, asset: { key, width: info.width, height: info.height } };
}
