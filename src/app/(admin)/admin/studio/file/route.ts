import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/session";
import { getProductById } from "@/lib/catalog";
import { bytesToStream } from "@/lib/stream-bytes";
import { objectsToStlZip } from "@/lib/stl-export";
import { clickerOptionOf } from "@/lib/clicker/of-product";
import { clickerConfigDamaged } from "@/lib/clicker/spec";
import { buildClickerPrint, checkDesign } from "@/lib/clicker/server";
import { keychainOptionOf } from "@/lib/keychain/of-product";
import { keychainConfigDamaged } from "@/lib/keychain/spec";
import { buildKeychainPrint, checkKeychain } from "@/lib/keychain/server";

const bodySchema = z.object({
  productId: z.string().uuid(),
  kind: z.enum(["clicker", "keychain"]),
  format: z.enum(["3mf", "stl"]),
  design: z.unknown(),
  /** Used in the file name only (a job reference or the customer's name). */
  label: z.string().max(40).optional(),
});

/**
 * Admin-only: the print file for a design made in the admin design studio (orders that came in off the site). The design
 * is checked and rebuilt here exactly like a customer's design, against the product's own settings; nothing the browser
 * built is trusted. `3mf` keeps the colours in one file; `stl` is a ZIP with one STL per colour piece.
 */
export async function POST(req: Request) {
  await requireAdmin();
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const { productId, kind, format, design, label } = parsed.data;

  const product = await getProductById(productId, { raw: true });
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
  const name = (label ?? "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24);
  const stamp = new Date().toISOString().slice(5, 10).replace("-", "");
  const base = `${kind}-${name || stamp}`;

  let built;
  if (kind === "clicker") {
    const c = clickerOptionOf(product.options);
    if (!c) return NextResponse.json({ error: "This product is not a clicker designer" }, { status: 422 });
    if (clickerConfigDamaged(c.option.constraints)) return NextResponse.json({ error: "The clicker settings are damaged. Save the product again, then retry." }, { status: 422 });
    const checked = await checkDesign(design, c.config);
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 422 });
    built = await buildClickerPrint(checked.spec, base, c.config.tune);
  } else {
    const k = keychainOptionOf(product.options);
    if (!k) return NextResponse.json({ error: "This product is not a keychain designer" }, { status: 422 });
    if (keychainConfigDamaged(k.option.constraints)) return NextResponse.json({ error: "The keychain settings are damaged. Save the product again, then retry." }, { status: 422 });
    const checked = await checkKeychain(design, k.config);
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 422 });
    built = await buildKeychainPrint(checked.spec, base);
  }
  if (!built.ok) return NextResponse.json({ error: built.error }, { status: 422 });

  const stl = format === "stl";
  return new Response(bytesToStream(stl ? objectsToStlZip(built.objects) : built.file), {
    headers: {
      "Content-Type": stl ? "application/zip" : "model/3mf",
      "Content-Disposition": `attachment; filename="${base}${stl ? "-stl.zip" : ".3mf"}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
