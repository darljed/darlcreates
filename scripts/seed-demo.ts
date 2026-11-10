/**
 * Demo data for reviewing layouts with realistic volume: products (with photos and simple 3D models),
 * customers, ~70 orders over the last 45 days in every status, payments, shipments, status history and reviews.
 *
 *   npx tsx scripts/seed-demo.ts seed     create the demo data (refuses if it already exists)
 *   npx tsx scripts/seed-demo.ts clear    remove ALL demo data (rows and S3 files) and nothing else
 *   npx tsx scripts/seed-demo.ts status   how many demo rows exist
 *
 * Everything is tagged so `clear` is exact: products `demo-*`, customers `seed-user-*` (emails @seed.darlcreates.test),
 * S3 keys starting `photos/demo-`, `models/demo-` and `customer/seed-user-`. Random choices use a fixed seed, so every run
 * produces the same data. The demo products are PUBLISHED so you can see the storefront: run `clear` before launch.
 * Writes to the database in .env.local and the S3 bucket. Refuses to run with NODE_ENV=production.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq, inArray, like, notLike } from "drizzle-orm";
import { CARRIERS, DEMO_CUSTOMERS, DEMO_PRODUCTS, REVIEW_BODIES, type DemoProduct } from "./fixtures/demo-data";

// ---------------------------------------------------------------- helpers
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261110);
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rand() * a.length)];
const between = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
const chance = (p: number) => rand() < p;
const HOUR = 3600_000;
const DAY = 24 * HOUR;

type V = [number, number, number];
function toStl(name: string, tris: [V, V, V][]): string {
  const f = (v: V) => v.map((n) => n.toFixed(5)).join(" ");
  const out = [`solid ${name}`];
  for (const [a, b, c] of tris) {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    out.push(`facet normal ${n.map((x) => (x / l).toFixed(5)).join(" ")}`, " outer loop", `  vertex ${f(a)}`, `  vertex ${f(b)}`, `  vertex ${f(c)}`, " endloop", "endfacet");
  }
  out.push(`endsolid ${name}`);
  return out.join("\n");
}
function box(w: number, d: number, h: number): [V, V, V][] {
  const p = (x: number, y: number, z: number): V => [x * w, y * d, z * h];
  const q = (a: V, b: V, c: V, e: V): [V, V, V][] => [[a, b, c], [a, c, e]];
  return [
    ...q(p(0, 0, 0), p(0, 1, 0), p(1, 1, 0), p(1, 0, 0)), ...q(p(0, 0, 1), p(1, 0, 1), p(1, 1, 1), p(0, 1, 1)),
    ...q(p(0, 0, 0), p(1, 0, 0), p(1, 0, 1), p(0, 0, 1)), ...q(p(0, 1, 0), p(0, 1, 1), p(1, 1, 1), p(1, 1, 0)),
    ...q(p(0, 0, 0), p(0, 0, 1), p(0, 1, 1), p(0, 1, 0)), ...q(p(1, 0, 0), p(1, 1, 0), p(1, 1, 1), p(1, 0, 1)),
  ];
}
function cylinder(r: number, h: number, n = 48, ri = 0): [V, V, V][] {
  const t: [V, V, V][] = [];
  const pt = (R: number, i: number, z: number): V => [R * Math.cos((2 * Math.PI * i) / n), R * Math.sin((2 * Math.PI * i) / n), z];
  for (let i = 0; i < n; i++) {
    const j = i + 1;
    t.push([pt(r, i, 0), pt(r, j, 0), pt(r, j, h)], [pt(r, i, 0), pt(r, j, h), pt(r, i, h)]);
    if (ri > 0) {
      t.push([pt(ri, i, 0), pt(ri, j, h), pt(ri, j, 0)], [pt(ri, i, 0), pt(ri, i, h), pt(ri, j, h)]);
      t.push([pt(ri, i, h), pt(r, i, h), pt(r, j, h)], [pt(ri, i, h), pt(r, j, h), pt(ri, j, h)]);
      t.push([pt(ri, i, 0), pt(ri, j, 0), pt(r, j, 0)], [pt(ri, i, 0), pt(r, j, 0), pt(r, i, 0)]);
    } else {
      t.push([[0, 0, h], pt(r, i, h), pt(r, j, h)], [[0, 0, 0], pt(r, j, 0), pt(r, i, 0)]);
    }
  }
  return t;
}
function wedge(w: number, d: number, h: number): [V, V, V][] {
  const A: V = [0, 0, 0], B: V = [w, 0, 0], C: V = [w, d, 0], D: V = [0, d, 0], E: V = [0, d * 0.25, h], F: V = [w, d * 0.25, h];
  return [[A, C, B], [A, D, C], [A, B, F], [A, F, E], [D, E, F], [D, F, C], [A, E, D], [B, C, F]];
}
function modelFor(kind: NonNullable<DemoProduct["model"]>, name: string) {
  const t = kind === "box" ? box(40, 25, 15) : kind === "cylinder" ? cylinder(20, 30) : kind === "ring" ? cylinder(18, 8, 48, 11) : wedge(60, 40, 35);
  return toStl(name, t);
}

// ---------------------------------------------------------------- main
async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("never run demo seeding in production");
  const cmd = process.argv[2];
  const { db } = await import("../src/db");
  const s = await import("../src/db/schema");
  const storage = await import("../src/lib/storage");
  const { computeUnitPrice } = await import("../src/lib/pricing");
  const { generateOrderNo } = await import("../src/lib/orders");
  const { FLAT_SHIPPING_CENTS } = await import("../src/lib/shipping");
  const { loadLegal } = await import("../src/lib/site-content-store");

  const USER_PREFIX = "seed-user-";
  const demoUsers = () => db.select({ id: s.users.id }).from(s.users).where(like(s.users.id, `${USER_PREFIX}%`));
  const demoProducts = () => db.select({ id: s.products.id, slug: s.products.slug }).from(s.products).where(like(s.products.slug, "demo-%"));

  // ------------------------------------------------------------ status / clear
  if (cmd === "status") {
    const [u, p] = [await demoUsers(), await demoProducts()];
    const ids = u.map((x) => x.id);
    const o = ids.length ? await db.select({ id: s.orders.id }).from(s.orders).where(inArray(s.orders.userId, ids)) : [];
    console.log(`demo customers: ${u.length}, demo products: ${p.length}, demo orders: ${o.length}`);
    process.exit(0);
  }

  async function clear() {
    const users = (await demoUsers()).map((x) => x.id);
    const products = await demoProducts();
    const photoKeys = products.length
      ? (await db.select({ k: s.productPhotos.s3Key }).from(s.productPhotos).where(inArray(s.productPhotos.productId, products.map((x) => x.id)))).map((x) => x.k)
      : [];
    const modelKeys = (await db.select({ k: s.products.stlKey }).from(s.products).where(like(s.products.slug, "demo-%"))).map((x) => x.k).filter((k): k is string => Boolean(k));
    if (users.length) {
      await db.delete(s.reviews).where(inArray(s.reviews.userId, users));
      await db.delete(s.orders).where(inArray(s.orders.userId, users)); // cascades items, payments, shipments, history
      await db.delete(s.carts).where(inArray(s.carts.userId, users));
      await db.delete(s.addresses).where(inArray(s.addresses.userId, users));
      await db.delete(s.sessions).where(inArray(s.sessions.userId, users));
      await db.delete(s.accounts).where(inArray(s.accounts.userId, users));
      await db.delete(s.users).where(inArray(s.users.id, users));
    }
    if (products.length) await db.delete(s.products).where(like(s.products.slug, "demo-%"));
    if (storage.isStorageConfigured()) {
      for (const k of [...photoKeys, ...modelKeys].filter((k) => /^(photos|models)\/demo-/.test(k))) await storage.deleteObject(k).catch(() => undefined);
      for (const id of users) await storage.deletePrefix(`customer/${id}/`).catch(() => 0);
    }
    return { users: users.length, products: products.length };
  }

  if (cmd === "clear") {
    const r = await clear();
    console.log(`cleared ${r.users} demo customers and ${r.products} demo products (with their orders, reviews and files)`);
    process.exit(0);
  }
  if (cmd !== "seed") throw new Error("usage: seed-demo.ts seed | clear | status");

  // ------------------------------------------------------------ seed
  if ((await demoUsers()).length || (await demoProducts()).length) {
    throw new Error("demo data already exists. Run `npx tsx scripts/seed-demo.ts clear` first.");
  }
  if (!storage.isStorageConfigured()) throw new Error("S3 is not configured (photos and models need it)");

  // payments are "verified by" the real owner account (never an E2E test user)
  const [realAdmin] = await db.select({ id: s.users.id }).from(s.users).where(and(eq(s.users.role, "admin"), notLike(s.users.id, "TEST-%"))).limit(1);
  const adminId = realAdmin?.id ?? null;
  const privacyVersion = (await loadLegal("privacy")).version;
  const now = Date.now();

  // 1) photos (generated with Pillow) and 3D models → S3
  const dir = mkdtempSync(join(tmpdir(), "demo-seed-"));
  try {
    execFileSync("python3", ["scripts/fixtures/demo-images.py", dir, JSON.stringify(DEMO_PRODUCTS.map((p) => ({ slug: p.slug, name: p.name, category: p.category })))], { stdio: "pipe" });
    const put = async (key: string, body: Uint8Array, type: string) => {
      const url = await storage.presignUpload(key, type, 300);
      const r = await fetch(url, { method: "PUT", headers: { "Content-Type": type }, body: new Uint8Array(body) });
      if (!r.ok) throw new Error(`S3 PUT ${key} failed: ${r.status}`);
    };

    // 2) products, options, photos
    type Opt = { id: string; type: "color" | "text" | "size" | "image"; label: string; required: boolean; priceDeltaCents: number; constraints: Record<string, unknown>; values: { id: string; label: string; value: string; priceDeltaCents: number }[] };
    const built = new Map<string, { id: string; base: number; options: Opt[]; p: DemoProduct }>();
    const productRows: (typeof s.products.$inferInsert)[] = [];
    const photoRows: (typeof s.productPhotos.$inferInsert)[] = [];
    const optionRows: (typeof s.productOptions.$inferInsert)[] = [];
    const valueRows: (typeof s.productOptionValues.$inferInsert)[] = [];
    let n = 0;
    for (const p of DEMO_PRODUCTS) {
      const id = randomUUID();
      const stlKey = p.model ? `models/demo-${p.slug.replace(/^demo-/, "")}.stl` : null;
      if (stlKey && p.model) await put(stlKey, new TextEncoder().encode(modelFor(p.model, p.slug)), "model/stl");
      for (let i = 1; i <= p.photos; i++) {
        const key = `photos/demo-${p.slug.replace(/^demo-/, "")}-${i}.png`;
        await put(key, readFileSync(join(dir, `${p.slug}-${i}.png`)), "image/png");
        photoRows.push({ productId: id, s3Key: key, alt: `${p.name}, photo ${i}`, sort: i - 1 });
      }
      productRows.push({ id, slug: p.slug, name: p.name, description: p.description, category: p.category, basePriceCents: p.priceCents, status: p.status, stlKey, createdAt: new Date(now - (60 - n) * DAY), updatedAt: new Date(now - (60 - n) * DAY) });
      n++;
      const options: Opt[] = [];
      p.options.forEach((o, sort) => {
        const optId = randomUUID();
        const delta = o.type === "text" || o.type === "image" ? (o.deltaCents ?? 0) : 0;
        const constraints = o.type === "text" ? { maxLen: o.maxLen } : o.type === "image" ? { formats: ["jpg", "png", "webp"], maxBytes: 5 * 1024 * 1024 } : {};
        optionRows.push({ id: optId, productId: id, type: o.type, label: o.label, required: o.required, priceDeltaCents: delta, constraints, sort });
        const values: Opt["values"] = [];
        if (o.type === "color" || o.type === "size") {
          o.values.forEach(([label, value, d], vs) => {
            const vid = randomUUID();
            valueRows.push({ id: vid, optionId: optId, label, value, priceDeltaCents: d ?? 0, sort: vs });
            values.push({ id: vid, label, value, priceDeltaCents: d ?? 0 });
          });
        }
        options.push({ id: optId, type: o.type, label: o.label, required: o.required, priceDeltaCents: delta, constraints, values });
      });
      built.set(p.slug, { id, base: p.priceCents, options, p });
    }
    await db.insert(s.products).values(productRows);
    if (photoRows.length) await db.insert(s.productPhotos).values(photoRows);
    if (optionRows.length) await db.insert(s.productOptions).values(optionRows);
    if (valueRows.length) await db.insert(s.productOptionValues).values(valueRows);

    // a shared customer image for the lithophane orders
    const litho = "customer/seed-user-maria-santos/demo-lithophane.png";
    await put(litho, readFileSync(join(dir, "demo-photo-lithophane-lamp-2.png")), "image/png");

    // 3) customers + saved addresses
    const userRows: (typeof s.users.$inferInsert)[] = DEMO_CUSTOMERS.map((c, i) => ({
      id: `${USER_PREFIX}${c.slug}`, name: c.name, email: `${c.slug}@seed.darlcreates.test`, emailVerified: true, role: "customer" as const,
      consentAt: new Date(now - (70 - i) * DAY), consentVersion: privacyVersion, createdAt: new Date(now - (70 - i) * DAY), updatedAt: new Date(now - (70 - i) * DAY),
    }));
    await db.insert(s.users).values(userRows);
    await db.insert(s.addresses).values(DEMO_CUSTOMERS.map((c) => ({ userId: `${USER_PREFIX}${c.slug}`, label: "Home", recipient: c.name, phone: c.phone, line1: c.line1, line2: c.line2 ?? "", barangay: c.barangay, city: c.city, province: c.province, postalCode: c.postalCode, isDefault: 1 })));

    // 4) orders
    const orders: (typeof s.orders.$inferInsert)[] = [];
    const items: (typeof s.orderItems.$inferInsert)[] = [];
    const pays: (typeof s.payments.$inferInsert)[] = [];
    const ships: (typeof s.shipments.$inferInsert)[] = [];
    const hist: (typeof s.orderStatusHistory.$inferInsert)[] = [];
    const delivered: { orderId: string; userId: string; deliveredAt: number; productIds: string[] }[] = [];
    const sellable = DEMO_PRODUCTS.filter((p) => p.status === "published");
    const retired = DEMO_PRODUCTS.find((p) => p.status === "archived")!;
    const names = ["ANA", "JM", "Kuya Ben", "Maria Clara", "DANIELLE", "Nics", "Mama", "Team Alpha", "Zoe", "Coach Rey"];
    let refN = 100000;
    const used = new Set<string>();
    const clamp = (t: number) => Math.min(t, now - 60_000);
    /** `delta` after `from`, never in the future, and always strictly later than `from` (so history keeps its order). */
    const adv = (from: number, delta: number) => {
      const c = clamp(from + delta);
      return c > from ? c : from + 1000;
    };

    const N = 72;
    for (let i = 0; i < N; i++) {
      const daysAgo = Math.floor(45 * Math.pow(rand(), 1.7));
      const placed = clamp(now - daysAgo * DAY - between(1, 14) * HOUR - between(0, 59) * 60_000);
      const age = (now - placed) / DAY;
      const cust = pick(DEMO_CUSTOMERS.concat(DEMO_CUSTOMERS.slice(0, 5)));
      const userId = `${USER_PREFIX}${cust.slug}`;

      // status by age
      const r = rand();
      type St = NonNullable<(typeof s.orders.$inferInsert)["status"]>;
      let status: St;
      if (age > 14) status = r < 0.76 ? "delivered" : r < 0.84 ? "cancelled" : r < 0.88 ? "refunded" : r < 0.96 ? "shipped" : "in_production";
      else if (age > 7) status = r < 0.42 ? "delivered" : r < 0.65 ? "shipped" : r < 0.8 ? "ready_to_ship" : r < 0.9 ? "in_production" : "cancelled";
      else if (age > 2) status = r < 0.18 ? "shipped" : r < 0.42 ? "ready_to_ship" : r < 0.66 ? "in_production" : r < 0.86 ? "paid" : r < 0.95 ? "awaiting_payment" : "cancelled";
      else status = r < 0.4 ? "awaiting_payment" : r < 0.65 ? "paid" : r < 0.85 ? "in_production" : "ready_to_ship";

      // lines
      const lineCount = chance(0.55) ? 1 : chance(0.6) ? 2 : 3;
      const chosen = new Set<string>();
      let subtotal = 0;
      const orderId = randomUUID();
      const lineProducts: string[] = [];
      for (let l = 0; l < lineCount; l++) {
        const useRetired = age > 25 && chance(0.1);
        const p = useRetired ? retired : pick(sellable);
        if (chosen.has(p.slug)) continue;
        chosen.add(p.slug);
        const b = built.get(p.slug)!;
        const selection: Record<string, { valueId?: string; text?: string; imageKey?: string }> = {};
        let imageKey: string | null = null;
        for (const o of b.options) {
          if (o.type === "color" || o.type === "size") selection[o.id] = { valueId: pick(o.values).id };
          else if (o.type === "text") selection[o.id] = { text: pick(names).slice(0, Number((o.constraints as { maxLen?: number }).maxLen ?? 14)) };
          else if (o.type === "image") { selection[o.id] = { imageKey: litho }; imageKey = litho; }
        }
        const price = computeUnitPrice(b.base, b.options, selection);
        const unit = price.errors.length ? b.base : price.unitPriceCents;
        const qty = chance(0.7) ? 1 : chance(0.7) ? 2 : between(3, 6);
        subtotal += unit * qty;
        items.push({ orderId, productId: b.id, nameSnapshot: p.name, qty, config: selection, imageKey, unitPriceCents: unit, stlKeySnapshot: productRows.find((x) => x.id === b.id)?.stlKey ?? null });
        lineProducts.push(b.id);
      }
      let orderNo = generateOrderNo(new Date(placed));
      while (used.has(orderNo)) orderNo = generateOrderNo(new Date(placed));
      used.add(orderNo);
      orders.push({
        id: orderId, orderNo, userId, status, subtotalCents: subtotal, shippingCents: FLAT_SHIPPING_CENTS, totalCents: subtotal + FLAT_SHIPPING_CENTS,
        shipAddress: { recipient: cust.name, phone: cust.phone, line1: cust.line1, line2: cust.line2 ?? "", barangay: cust.barangay, city: cust.city, province: cust.province, postalCode: cust.postalCode },
        placedAt: new Date(placed),
      });
      hist.push({ orderId, fromStatus: null, toStatus: "awaiting_payment", note: "Order placed", actorId: userId, createdAt: new Date(placed) });

      // payments + history chain
      const total = subtotal + FLAT_SHIPPING_CENTS;
      const ref = () => { refN += between(1, 97); return `DEMO${String(refN).padStart(10, "0")}`; };
      const submitted = adv(placed, between(15, 200) * 60_000);
      const paidStatuses: St[] = ["paid", "in_production", "ready_to_ship", "shipped", "delivered", "refunded"];
      const wasPaid = paidStatuses.includes(status) || (status === "cancelled" && age > 3 && chance(0.4));
      let t = placed;
      const step = (to: St, from: St, note: string, hoursLo: number, hoursHi: number, actor: string | null) => {
        t = adv(t, between(hoursLo, hoursHi) * HOUR + between(0, 59) * 60_000);
        hist.push({ orderId, fromStatus: from, toStatus: to, note, actorId: actor, createdAt: new Date(t) });
      };

      if (status === "awaiting_payment") {
        const v = rand();
        if (v < 0.4) pays.push({ orderId, method: "gcash", gcashReference: ref(), amountCents: total, status: "pending", submittedAt: new Date(submitted) });
        else if (v < 0.55) pays.push({ orderId, method: "gcash", gcashReference: ref(), amountCents: total, status: "rejected", submittedAt: new Date(submitted), verifiedBy: adminId, verifiedAt: new Date(adv(submitted, 3 * HOUR)), rejectReason: "Amount does not match the order total" });
      } else if (wasPaid) {
        const hadReject = chance(0.12);
        if (hadReject) pays.push({ orderId, method: "gcash", gcashReference: ref(), amountCents: total, status: "rejected", submittedAt: new Date(submitted), verifiedBy: adminId, verifiedAt: new Date(adv(submitted, 2 * HOUR)), rejectReason: "Reference not found in GCash history" });
        // a re-submission happens after the rejection
        const sub2 = hadReject ? adv(submitted, between(5, 20) * HOUR) : submitted;
        const rf = ref();
        const verifiedAt = adv(sub2, between(1, 8) * HOUR);
        pays.push({ orderId, method: "gcash", gcashReference: rf, amountCents: total, status: "verified", submittedAt: new Date(sub2), verifiedBy: adminId, verifiedAt: new Date(verifiedAt) });
        t = verifiedAt;
        hist.push({ orderId, fromStatus: "awaiting_payment", toStatus: "paid", note: `Payment ${rf} verified`, actorId: adminId, createdAt: new Date(verifiedAt) });
        let cur: St = "paid";
        const chain: [St, number, number][] = [["in_production", 3, 30], ["ready_to_ship", 24, 72], ["shipped", 2, 24], ["delivered", 48, 120]];
        const target = status === "refunded" || status === "cancelled" ? (chance(0.5) ? "paid" : "in_production") : status;
        for (const [to, lo, hi] of chain) {
          if (cur === target) break;
          step(to, cur, to === "shipped" ? "Handed to courier" : to === "delivered" ? "Delivered" : "", lo, hi, adminId);
          cur = to;
          if (cur === target) break;
        }
        if (status === "refunded") step("refunded", cur, "Refunded via GCash", 24, 96, adminId);
        if (status === "cancelled") step("cancelled", cur, "Cancelled at the customer's request", 4, 48, adminId);
        if (status === "shipped" || status === "delivered") {
          const tn = `${pick(["JT", "LBC", "FE", "GX"])}${String(between(100000000000, 999999999999))}`;
          ships.push({ orderId, carrier: pick(CARRIERS), trackingNo: tn, status: status === "delivered" ? "Delivered" : "In transit", updatedAt: new Date(t) });
        }
        if (status === "delivered") delivered.push({ orderId, userId, deliveredAt: t, productIds: lineProducts });
      } else if (status === "cancelled") {
        if (chance(0.5)) pays.push({ orderId, method: "gcash", gcashReference: ref(), amountCents: total, status: "rejected", submittedAt: new Date(submitted), verifiedBy: adminId, verifiedAt: new Date(adv(submitted, 3 * HOUR)), rejectReason: "Wrong amount sent" });
        step("cancelled", "awaiting_payment", chance(0.6) ? "Cancelled by customer" : "No payment received", 12, 96, chance(0.5) ? userId : adminId);
      }
    }

    await db.insert(s.orders).values(orders);
    for (let i = 0; i < items.length; i += 100) await db.insert(s.orderItems).values(items.slice(i, i + 100));
    for (let i = 0; i < pays.length; i += 100) await db.insert(s.payments).values(pays.slice(i, i + 100));
    if (ships.length) await db.insert(s.shipments).values(ships);
    for (let i = 0; i < hist.length; i += 100) await db.insert(s.orderStatusHistory).values(hist.slice(i, i + 100));

    // 5) reviews for delivered items
    const reviews: (typeof s.reviews.$inferInsert)[] = [];
    const seen = new Set<string>();
    for (const d of delivered) {
      for (const productId of d.productIds) {
        const key = `${d.userId}:${productId}`;
        if (seen.has(key) || !chance(0.6)) continue;
        seen.add(key);
        const rv = pick(REVIEW_BODIES);
        reviews.push({ productId, orderId: d.orderId, userId: d.userId, rating: rv.stars, body: rv.body, approved: chance(0.78), createdAt: new Date(clamp(d.deliveredAt + between(1, 9) * DAY)) });
      }
    }
    if (reviews.length) await db.insert(s.reviews).values(reviews);

    const byStatus = orders.reduce<Record<string, number>>((m, o) => ((m[o.status ?? "?"] = (m[o.status ?? "?"] ?? 0) + 1), m), {});
    console.log(`seeded: ${productRows.length} products (${photoRows.length} photos, ${productRows.filter((p) => p.stlKey).length} 3D models), ${userRows.length} customers`);
    console.log(`        ${orders.length} orders ${JSON.stringify(byStatus)}`);
    console.log(`        ${items.length} order lines, ${pays.length} payments, ${ships.length} shipments, ${hist.length} history rows, ${reviews.length} reviews`);
    console.log("remove it all later with: npx tsx scripts/seed-demo.ts clear");
  } catch (e) {
    console.error("seed failed, rolling back what was created:", (e as Error).message);
    await clear().catch(() => undefined);
    process.exitCode = 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  process.exit(process.exitCode ?? 0);
}
main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
