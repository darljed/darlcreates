/**
 * The agent's tools. SERVER ONLY. Two kinds:
 *   read   runs at once and returns facts (kept small, and with no customer names, emails, phones or addresses);
 *   write  never runs when the model asks. The agent loop turns it into a PROPOSAL (what would change, before and after)
 *          that a person approves; only then `apply` runs, through the same Server Actions the admin screens use, so every
 *          check, audit line and cache refresh happens as usual.
 * Not offered to the agent at all: payment verification, refunds, order status changes, users and roles, deleting anything,
 * site content. Add a tool here only after deciding how it is previewed and what can go wrong if the model is tricked.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { orders, products } from "@/db/schema";
import { adminListOrders, adminListProducts } from "@/lib/admin";
import { getProductById } from "@/lib/catalog";
import { getOrderByIdAdmin } from "@/lib/orders";
import { getProductCosting } from "@/lib/workshop/costing";
import { listPartsWithCost } from "@/lib/workshop/inventory";
import { workshopSummary } from "@/lib/workshop/summary";
import { PAYMENT_STATUSES, SALE_STATUSES } from "@/lib/workshop/types";
import { createProductAction, updateProductAction } from "@/app/(admin)/admin/products/actions";
import { saveProductCostingAction } from "@/app/(admin)/admin/products/costing-actions";
import { adjustStockAction, recordPurchaseAction } from "@/app/(admin)/admin/inventory/actions";
import { createSaleAction } from "@/app/(admin)/admin/sales/actions";
import { OPTION_TOOLS } from "./options-tools";

export type Preview = { summary: string; before: Record<string, unknown> | null; after: Record<string, unknown> };
export type ApplyResult = { ok: true; link?: string } | { ok: false; error: string };
export type Tool = {
  name: string;
  description: string;
  kind: "read" | "write";
  params: z.ZodType<Record<string, unknown>>;
  /** read tools */
  run?: (args: never) => Promise<unknown>;
  /** write tools: what would change. `{ error }` when the request makes no sense (unknown id, nothing to change). */
  preview?: (args: never) => Promise<Preview | { error: string }>;
  apply?: (args: never) => Promise<ApplyResult>;
};

const uuid = z.string().uuid();
const pesos = z.number().finite().min(0).max(100_000_000);
const centsToPesos = (c: number) => Math.round(c) / 100;
const iso = (d: Date) => d.toISOString().slice(0, 10);

// the tool's `run`/`preview`/`apply` get their own typed args; the registry stores them loosely
function tool<S extends z.ZodType<Record<string, unknown>>>(t: { name: string; description: string; kind: "read" | "write"; params: S; run?: (a: z.infer<S>) => Promise<unknown>; preview?: (a: z.infer<S>) => Promise<Preview | { error: string }>; apply?: (a: z.infer<S>) => Promise<ApplyResult> }): Tool {
  return t as unknown as Tool;
}

// ---- read tools ---------------------------------------------------------------------------------------------------

const listProducts = tool({
  name: "list_products",
  kind: "read",
  description: "Find products. Returns id, name, category, price in pesos, status (draft/published/archived). Use it to look up a product's id by name.",
  params: z.object({ query: z.string().max(80).optional(), status: z.enum(["draft", "published", "archived"]).optional() }),
  run: async (a) => {
    const q = a.query?.trim().toLowerCase();
    const rows = (await adminListProducts()).filter((p) => (!a.status || p.status === a.status) && (!q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)));
    return { total: rows.length, products: rows.slice(0, 30).map((p) => ({ id: p.id, name: p.name, category: p.category, pricePesos: centsToPesos(p.basePriceCents), status: p.status, hasModel: Boolean(p.stlKey), service: p.designer ?? (p.isService ? "service" : null) })) };
  },
});

const getProduct = tool({
  name: "get_product",
  kind: "read",
  description: "Everything about one product: copy, price, status, options, photo count and its internal costing (print cost, parts, margin).",
  params: z.object({ productId: uuid }),
  run: async (a) => {
    const p = await getProductById(a.productId, { raw: true });
    if (!p) return { error: "Product not found" };
    const c = await getProductCosting(p.id);
    return {
      id: p.id, slug: p.slug, name: p.name, description: p.description, category: p.category, pricePesos: centsToPesos(p.basePriceCents), status: p.status, weightGrams: p.weightGrams,
      hasModel: Boolean(p.stlKey), photoCount: p.photos.length,
      options: p.options.map((o) => ({ label: o.label, type: o.type, required: o.required, choices: o.values?.length ?? 0 })),
      costing: c && { printCostPesos: centsToPesos(c.printCostCents), partsCostPesos: centsToPesos(c.partsCostCents), unitCostPesos: centsToPesos(c.unitCostCents), marginPct: Math.round(c.marginPct * 1000) / 10, parts: c.bom.map((b) => ({ partId: b.partId, part: b.partName, qty: b.qty, unit: b.unit })) },
    };
  },
});

const listOrders = tool({
  name: "list_orders",
  kind: "read",
  description: "Recent online orders, newest first: order number, status, total in pesos and what was ordered. No customer details are shown to you.",
  params: z.object({ status: z.string().max(30).optional(), orderNo: z.string().max(40).optional(), limit: z.number().int().min(1).max(30).default(10) }),
  run: async (a) => {
    const r = await adminListOrders({ status: a.status, q: a.orderNo, pageSize: a.limit });
    return { total: r.total, orders: r.rows.map((o) => ({ id: o.id, orderNo: o.orderNo, status: o.status, totalPesos: centsToPesos(o.totalCents), placed: iso(o.placedAt), items: o.itemsLabel })) };
  },
});

const getOrder = tool({
  name: "get_order",
  kind: "read",
  description: "One online order by id or order number: lines, totals, payment status, shipment and status history. No customer name, contact or address is shown to you.",
  params: z.object({ orderId: uuid.optional(), orderNo: z.string().max(40).optional() }).refine((v) => v.orderId !== undefined || v.orderNo !== undefined, "Give an order id or an order number"),
  run: async (a) => {
    let id = a.orderId;
    if (!id && a.orderNo) id = (await db.select({ id: orders.id }).from(orders).where(eq(orders.orderNo, a.orderNo)).limit(1))[0]?.id;
    if (!id) return { error: "Give an order id or order number that exists" };
    const o = await getOrderByIdAdmin(id);
    if (!o) return { error: "Order not found" };
    return {
      id: o.id, orderNo: o.orderNo, status: o.status, placed: iso(o.placedAt), subtotalPesos: centsToPesos(o.subtotalCents), shippingPesos: centsToPesos(o.shippingCents), totalPesos: centsToPesos(o.totalCents),
      items: o.items.map((i) => ({ name: i.name, qty: i.qty, unitPricePesos: centsToPesos(i.unitPriceCents), choices: i.summary.map((s) => `${s.label}: ${s.value}`) })),
      payment: o.latestPayment && { status: o.latestPayment.status, amountPesos: centsToPesos(o.latestPayment.amountCents) },
      shipment: o.shipment && { carrier: o.shipment.carrier, status: o.shipment.status }, // no tracking number: it can be used to look up the customer's delivery
      history: o.history.slice(-8).map((h) => ({ status: h.toStatus, at: iso(h.createdAt) })),
    };
  },
});

const salesSummary = tool({
  name: "sales_summary",
  kind: "read",
  description: "Revenue and profit, online orders vs off-site sales, for today / this week / this month and all time, plus inventory value and low-stock parts. Fields ending in Cents are centavos (100 = 1 peso).",
  params: z.object({}),
  run: async () => workshopSummary(),
});

const listParts = tool({
  name: "list_parts",
  kind: "read",
  description: "Inventory parts (filament, switches, hardware): id, unit, quantity on hand, reorder level, average unit cost in pesos.",
  params: z.object({ lowStockOnly: z.boolean().default(false) }),
  run: async (a) => {
    const rows = (await listPartsWithCost()).filter((p) => !a.lowStockOnly || p.qtyOnHand <= p.reorderLevel);
    return { total: rows.length, parts: rows.slice(0, 60).map((p) => ({ id: p.id, name: p.name, category: p.category, unit: p.unit, qtyOnHand: p.qtyOnHand, reorderLevel: p.reorderLevel, unitCostPesos: centsToPesos(p.unitCostCents) })) };
  },
});

// ---- write tools (proposals) --------------------------------------------------------------------------------------

async function productRow(id: string) {
  const [p] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  return p ?? null;
}

const updateProduct = tool({
  name: "update_product",
  kind: "write",
  description: "Propose a change to a product's name, description, category, price (pesos), status or packed weight. Only send the fields that change. Needs the owner's approval before anything happens.",
  params: z.object({
    productId: uuid,
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(2000).optional(),
    category: z.string().trim().min(1).max(60).optional(),
    pricePesos: pesos.optional(),
    status: z.enum(["draft", "published", "archived"]).optional(),
    weightGrams: z.number().int().min(1).max(50_000).nullable().optional(),
  }),
  preview: async (a) => {
    const p = await productRow(a.productId);
    if (!p) return { error: "Product not found" };
    const cur: Record<string, unknown> = { name: p.name, description: p.description, category: p.category, pricePesos: centsToPesos(p.basePriceCents), status: p.status, weightGrams: p.weightGrams };
    const next: Record<string, unknown> = { ...cur };
    for (const k of ["name", "description", "category", "pricePesos", "status", "weightGrams"] as const) if (a[k] !== undefined) next[k] = k === "category" ? String(a[k]).toLowerCase() : a[k];
    const changed = Object.keys(cur).filter((k) => JSON.stringify(cur[k]) !== JSON.stringify(next[k]));
    if (!changed.length) return { error: "That is already how the product is. Nothing to change." };
    return { summary: `Update "${p.name}": ${changed.join(", ")}`, before: Object.fromEntries(changed.map((k) => [k, cur[k]])), after: Object.fromEntries(changed.map((k) => [k, next[k]])) };
  },
  apply: async (a) => {
    const p = await productRow(a.productId);
    if (!p) return { ok: false, error: "Product not found" };
    const r = await updateProductAction({
      id: p.id,
      name: a.name ?? p.name,
      description: a.description ?? p.description,
      category: a.category ?? p.category,
      basePrice: (a.pricePesos !== undefined ? a.pricePesos : centsToPesos(p.basePriceCents)).toFixed(2),
      status: a.status ?? p.status,
      weightGrams: a.weightGrams !== undefined ? (a.weightGrams ?? "") : (p.weightGrams ?? ""),
    });
    return r.ok ? { ok: true, link: `/admin/products/${p.id}` } : { ok: false, error: r.error };
  },
});

const createProduct = tool({
  name: "create_product",
  kind: "write",
  description: "Propose a new product. It is always created as an unpublished draft (no model or photos; those are added in the product editor or the Product studio). Needs the owner's approval.",
  params: z.object({ name: z.string().trim().min(2).max(120), description: z.string().trim().max(2000), category: z.string().trim().min(1).max(60), pricePesos: pesos, weightGrams: z.number().int().min(1).max(50_000).optional() }),
  preview: async (a) => ({ summary: `Create draft product "${a.name}" at ₱${a.pricePesos}`, before: null, after: { name: a.name, description: a.description, category: a.category.toLowerCase(), pricePesos: a.pricePesos, status: "draft", weightGrams: a.weightGrams ?? null } }),
  apply: async (a) => {
    const r = await createProductAction({ name: a.name, description: a.description, category: a.category, basePrice: a.pricePesos.toFixed(2), status: "draft", weightGrams: a.weightGrams ?? "" });
    return r.ok && r.id ? { ok: true, link: `/admin/products/${r.id}` } : { ok: false, error: r.ok ? "Could not create the product" : r.error };
  },
});

const setCosting = tool({
  name: "set_product_costing",
  kind: "write",
  description: "Propose a product's internal costing: print cost per unit (pesos) and optionally the parts used per unit (bom). Leave bom out to keep the current parts. Needs approval.",
  params: z.object({ productId: uuid, printCostPesos: pesos, bom: z.array(z.object({ partId: uuid, qty: z.number().finite().gt(0).max(1_000_000) })).max(60).optional() }),
  preview: async (a) => {
    const c = await getProductCosting(a.productId);
    if (!c) return { error: "Product not found" };
    const parts = a.bom ? await listPartsWithCost() : [];
    const name = (id: string) => parts.find((x) => x.id === id)?.name ?? id;
    if (a.bom && a.bom.some((b) => !parts.some((x) => x.id === b.partId))) return { error: "One of the parts does not exist. Use list_parts for real ids." };
    const before = { printCostPesos: centsToPesos(c.printCostCents), parts: c.bom.map((b) => `${b.qty} ${b.unit} ${b.partName}`) };
    const after = { printCostPesos: a.printCostPesos, parts: a.bom ? a.bom.map((b) => `${b.qty} ${name(b.partId)}`) : before.parts };
    if (JSON.stringify(before) === JSON.stringify(after)) return { error: "Costing is already like that." };
    return { summary: `Set costing for "${c.name}"`, before, after };
  },
  apply: async (a) => {
    const c = await getProductCosting(a.productId);
    if (!c) return { ok: false, error: "Product not found" };
    const r = await saveProductCostingAction({ productId: a.productId, printCostPesos: a.printCostPesos, bom: a.bom ?? c.bom.map((b) => ({ partId: b.partId, qty: b.qty })) });
    return r.ok ? { ok: true, link: `/admin/products/${a.productId}` } : { ok: false, error: r.error };
  },
});

async function partRow(id: string) {
  return (await listPartsWithCost()).find((p) => p.id === id) ?? null;
}

const recordPurchase = tool({
  name: "record_purchase",
  kind: "write",
  description: "Propose a stock purchase: quantity bought and the total price paid (pesos) for a part. Raises the quantity on hand and updates the average cost. Needs approval.",
  params: z.object({ partId: uuid, qty: z.number().finite().gt(0).max(1_000_000_000), totalCostPesos: pesos, supplier: z.string().trim().max(120).optional() }),
  preview: async (a) => {
    const p = await partRow(a.partId);
    if (!p) return { error: "Part not found. Use list_parts for real ids." };
    return { summary: `Record purchase of ${a.qty} ${p.unit} ${p.name} for ₱${a.totalCostPesos}`, before: { qtyOnHand: p.qtyOnHand }, after: { qtyOnHand: p.qtyOnHand + a.qty, paidPesos: a.totalCostPesos, supplier: a.supplier ?? null } };
  },
  apply: async (a) => {
    const r = await recordPurchaseAction(a);
    return r.ok ? { ok: true, link: "/admin/inventory" } : { ok: false, error: r.error };
  },
});

const adjustStock = tool({
  name: "adjust_stock",
  kind: "write",
  description: "Propose a stock correction for a part: a + / - change (delta) or the real counted quantity (setTo), with a reason. Needs approval.",
  params: z.object({ partId: uuid, delta: z.number().finite().optional(), setTo: z.number().finite().min(0).max(1_000_000_000).optional(), reason: z.string().trim().min(1).max(200) }).refine((v) => (v.delta === undefined) !== (v.setTo === undefined), "Give either delta or setTo"),
  preview: async (a) => {
    const p = await partRow(a.partId);
    if (!p) return { error: "Part not found. Use list_parts for real ids." };
    const next = a.setTo !== undefined ? a.setTo : p.qtyOnHand + (a.delta ?? 0);
    if (next === p.qtyOnHand) return { error: "The quantity is already that." };
    return { summary: `Adjust ${p.name}: ${p.qtyOnHand} → ${next} ${p.unit} (${a.reason})`, before: { qtyOnHand: p.qtyOnHand }, after: { qtyOnHand: next, reason: a.reason } };
  },
  apply: async (a) => {
    const r = await adjustStockAction(a);
    return r.ok ? { ok: true, link: "/admin/inventory" } : { ok: false, error: r.error };
  },
});

const createSale = tool({
  name: "create_offsite_sale",
  kind: "write",
  description: "Propose a sale made outside the website to put in the off-site sales log (product, quantity, price per item in pesos, payment status). Needs approval.",
  params: z.object({
    productId: uuid,
    quantity: z.number().int().min(1).max(100_000),
    pricePerItemPesos: pesos,
    paymentStatus: z.enum(PAYMENT_STATUSES).default("Unpaid"),
    modeOfPayment: z.string().trim().max(40).optional(),
    status: z.enum(SALE_STATUSES).default("For Processing"),
    contact: z.string().trim().max(160).optional(),
    deliveryDetails: z.string().trim().max(500).optional(),
    details: z.string().trim().max(2000).optional(),
  }),
  preview: async (a) => {
    const p = await productRow(a.productId);
    if (!p) return { error: "Product not found" };
    return { summary: `Log off-site sale: ${a.quantity} × ${p.name} at ₱${a.pricePerItemPesos} (${a.paymentStatus})`, before: null, after: { product: p.name, quantity: a.quantity, pricePerItemPesos: a.pricePerItemPesos, totalPesos: Math.round(a.quantity * a.pricePerItemPesos * 100) / 100, paymentStatus: a.paymentStatus, status: a.status, contact: a.contact ?? null } };
  },
  apply: async (a) => {
    const r = await createSaleAction(a);
    return r.ok ? { ok: true, link: "/admin/sales" } : { ok: false, error: r.error };
  },
});

/** Everything the admin agent may use. The 3D options tools are listed too, so a proposal from the Product studio tab is approved the same way. */
export const TOOLS: Tool[] = [listProducts, getProduct, listOrders, getOrder, salesSummary, listParts, updateProduct, createProduct, setCosting, recordPurchase, adjustStock, createSale, ...OPTION_TOOLS];
export const toolByName = (name: string) => TOOLS.find((t) => t.name === name) ?? null;
