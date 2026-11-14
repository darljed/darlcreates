/**
 * Internal waybill: the Code 128 encoder (table sanity, known checksum, encode/decode round trip) and the printed
 * slip (order number, address, items, payment warning, no prices or email, escaping). Static render, no DB.
 * Run: npx tsx scripts/test-waybill.ts
 */
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { CODE128_PATTERNS, code128Bars, code128Values } from "../src/lib/code128";
import { Waybill } from "../src/components/waybill";
import type { OrderDetail } from "../src/lib/orders";

let failures = 0;
function assert(name: string, cond: boolean, extra = "") {
  if (!cond) { failures++; console.error(`  ✗ ${name} ${extra}`); } else console.log(`  ✓ ${name}`);
}

console.log("\ncode 128 table");
assert("106 symbols (0-102 data, 103-105 start)", CODE128_PATTERNS.length === 106);
assert("every pattern is 6 widths of 1-4 summing to 11", CODE128_PATTERNS.every((p) => /^[1-4]{6}$/.test(p) && [...p].reduce((n, d) => n + Number(d), 0) === 11));
assert("bar widths of every pattern add up to an even number", CODE128_PATTERNS.every((p) => (Number(p[0]) + Number(p[2]) + Number(p[4])) % 2 === 0));
assert("all patterns are different", new Set(CODE128_PATTERNS).size === 106);

console.log("\nencoding");
const v = code128Values("PJJ123C"); // the textbook example; with start B the checksum is 55
assert("start B first, checksum 55 last", v[0] === 104 && v.at(-1) === 55, JSON.stringify(v));
assert("rejects characters outside printable ASCII", (() => { try { code128Values("café"); return false; } catch { return true; } })());
assert("rejects empty text", (() => { try { code128Values(""); return false; } catch { return true; } })());

// decode our own output: bar/space widths -> symbols -> text, and verify the checksum
function decode(text: string): string {
  const { bars, width } = code128Bars(text);
  const runs: number[] = [];
  let x = 10;
  for (const b of bars) { if (b.x > x) runs.push(b.x - x); runs.push(b.w); x = b.x + b.w; }
  const body = runs.slice(0, runs.length - 7); // minus the 7-width stop
  assert(`${text}: ends with the stop pattern and a quiet zone`, runs.slice(-7).join("") === "2331112" && width - x === 10);
  const values: number[] = [];
  for (let i = 0; i < body.length; i += 6) values.push(CODE128_PATTERNS.indexOf(body.slice(i, i + 6).join("")));
  const [start, ...rest] = values;
  const check = rest.pop()!;
  const sum = rest.reduce((s, val, i) => s + val * (i + 1), start) % 103;
  assert(`${text}: checksum verifies`, start === 104 && sum === check && !values.includes(-1));
  return rest.map((val) => String.fromCharCode(val + 32)).join("");
}
for (const t of ["DC-20261109-K7M2QX", "TEST-1", "a b~"]) assert(`round trip "${t}"`, decode(t) === t);
const { bars } = code128Bars("DC-20261109-K7M2QX");
assert("bars never overlap", bars.every((b, i) => i === 0 || b.x > bars[i - 1].x + bars[i - 1].w - 1));

console.log("\nthe slip");
const order: OrderDetail = {
  id: "o1", userId: "u1", orderNo: "DC-20261110-ABC234", status: "in_production", subtotalCents: 25000, shippingCents: 8000, totalCents: 33000,
  placedAt: new Date("2026-11-10T04:00:00Z"),
  shipAddress: { recipient: "Ana Cruz", phone: "09171234567", line1: "12 Mabini St", city: "San Pablo", province: "Laguna", postalCode: "4000" },
  items: [
    { id: "i1", name: "Outdoor Phone Stand", slug: "outdoor-phone-stand", qty: 2, unitPriceCents: 12500, summary: [{ label: "Color", value: "Green" }], stlKey: null, nameText: null, imageUrl: null, designUri: null, clicker: false },
    { id: "i2", name: "Name Keychain", slug: null, qty: 1, unitPriceCents: 9900, summary: [{ label: "Name", value: "Ana" }], stlKey: null, nameText: null, imageUrl: null, designUri: null, clicker: false },
  ],
  latestPayment: { reference: "GC1234567890", status: "verified", amountCents: 33000, proofKey: null, rejectReason: null, verifiedAt: new Date("2026-11-10T06:00:00Z") },
  shipment: null, history: [],
};
const store = { name: "Darl Creates", address: "San Pablo City", phone: "" };
const render = (o: OrderDetail, s = store) => renderToStaticMarkup(createElement(Waybill, { order: o, store: s }));
const html = render(order);
const text = html.replace(/<style>.*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
assert("shows the order number and a barcode", text.includes("DC-20261110-ABC234") && html.includes("<svg") && html.includes('aria-label="Barcode DC-20261110-ABC234"'));
assert("shows recipient, phone and full address", text.includes("Ana Cruz") && text.includes("09171234567") && text.includes("12 Mabini St, San Pablo, Laguna, 4000"));
assert("lists every item with quantity and options, and the piece count", text.includes("2× Outdoor Phone Stand") && text.includes("Color: Green") && text.includes("1× Name Keychain") && text.includes("Pack (3 pieces)"));
assert("leaves prices and the email off", !/₱|@|\d+\.\d\d/.test(text));
assert("paid order shows 'Paid and verified'", text.includes("Paid and verified") && !text.includes("do not ship"));
assert("unverified payment warns not to ship", render({ ...order, status: "awaiting_payment", latestPayment: null }).includes("NOT VERIFIED: do not ship"));
assert("blank courier and tracking lines when not shipped yet", text.includes("Courier: ______") && text.includes("Tracking no.: ______"));
assert("fills courier and tracking once saved", (() => { const t = render({ ...order, shipment: { carrier: "J&T", trackingNo: "JT123", status: "ready" } }); return t.includes("J&amp;T") && t.includes("JT123"); })());
assert("has the tick boxes", ["Printed", "Cleaned", "Packed", "Handed to courier"].every((s) => text.includes(s)));
assert("redacted address doesn't print 'undefined'", (() => { const t = render({ ...order, shipAddress: { redacted: true } }).replace(/<[^>]+>/g, " "); return t.includes("address removed") && !t.includes("undefined"); })());
assert("HTML-escapes hostile names", !render({ ...order, shipAddress: { ...order.shipAddress, recipient: "<script>alert(1)</script>" } }).includes("<script>alert"));
assert("never mentions tax or registration", !/\bBIR\b|registered|receipt|invoice|\bVAT\b|\bTIN\b|tax/i.test(text));
assert("prints A6", html.includes("size: A6"));

if (failures) { console.error(`\n${failures} assertion(s) failed`); process.exit(1); }
console.log("\nAll waybill checks passed.");
