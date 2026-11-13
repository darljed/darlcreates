"use server";

import { z } from "zod";
import { getProductById } from "@/lib/catalog";
import { getAccess } from "@/lib/session";
import { flatColourCount } from "@/lib/clicker/redraw-post";
import { clickerOptionOf } from "@/lib/clicker/of-product";
import { REDRAW_DAILY_LIMIT, REDRAW_MODES, looksLikeImageDataUrl, redrawPicture, takeRedrawSlot } from "@/lib/clicker/redraw";

type RedrawActionResult =
  | { ok: true; image: string; key?: string }
  | { ok: false; error: string; needs?: "sign_in" | "consent" };

const redrawSchema = z.object({
  productId: z.string().uuid(),
  mode: z.enum(REDRAW_MODES as unknown as [string, ...string[]]),
  /** The picture, already shrunk by the browser (about 768 px). */
  image: z.string().max(1_600_000),
  /** The first answer traced into too much detail: use the other model. */
  retry: z.boolean().optional(),
});

/**
 * Redraw the customer's picture as flat colours or a 2-colour portrait (see lib/clicker/redraw.ts). Signed-in customers
 * only, on products where the owner switched AI on, limited per customer per day. The colours asked for come from the
 * shop's colour inventory (the product's palette), never from the browser. Costs real money per call, so every check
 * runs before the AI is called.
 */
export async function redrawPictureAction(input: unknown): Promise<RedrawActionResult> {
  const access = await getAccess();
  if (access.state === "signed_out") return { ok: false, error: "Please sign in to use AI redraw. Your design is kept.", needs: "sign_in" };
  if (access.state === "consent") return { ok: false, error: "Please accept the privacy policy to continue.", needs: "consent" };
  if (access.state !== "ok") return { ok: false, error: "This account can't use AI redraw." };

  const parsed = redrawSchema.safeParse(input);
  if (!parsed.success || !looksLikeImageDataUrl(parsed.data.image)) return { ok: false, error: "We couldn't use that picture. Try a PNG or JPG." };
  const { productId, mode, image, retry } = parsed.data;

  const product = await getProductById(productId);
  const clicker = product && product.status === "published" ? clickerOptionOf(product.options) : null;
  if (!clicker || !clicker.config.allowImages || !clicker.config.allowAi) return { ok: false, error: "AI redraw isn't available for this product." };

  if (!takeRedrawSlot(access.user.id)) return { ok: false, error: `You've redrawn ${REDRAW_DAILY_LIMIT} pictures today, which is the most for one day. Try again tomorrow, or use your picture as it is.` };

  const colours = flatColourCount(clicker.config.maxColours);
  const res = await redrawPicture({ mode: mode as "flat" | "stencil", imageDataUrl: image, palette: clicker.config.palette, colours, retry });
  if (!res.ok) return { ok: false, error: res.error };
  console.info("ai-redraw", { user: access.user.id, mode, model: res.model, costUsd: res.costUsd });
  return { ok: true, image: res.image, key: "key" in res ? res.key : undefined };
}
