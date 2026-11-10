/**
 * The Order Acknowledgment must never read as an official receipt / tax invoice, shows VAT as 0,
 * and reflects the real order numbers. Static render (no browser). Run: npx tsx scripts/test-acknowledgment.ts
 */
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { Acknowledgment } from "../src/components/acknowledgment";
import type { OrderDetail } from "../src/lib/orders";

let failures = 0;
function assert(name: string, cond: boolean, extra = "") {
  if (!cond) { failures++; console.error(`  ✗ ${name} ${extra}`); } else console.log(`  ✓ ${name}`);
}

const base: OrderDetail = {
  id: "o1", orderNo: "DC-20261110-ABC234", status: "paid", subtotalCents: 25000, shippingCents: 8000, totalCents: 33000,
  placedAt: new Date("2026-11-10T04:00:00Z"),
  shipAddress: { recipient: "Ana Cruz", phone: "09171234567", line1: "12 Mabini St", city: "San Pablo", province: "Laguna", postalCode: "4000" },
  items: [{ id: "i1", name: "Outdoor Phone Stand", qty: 2, unitPriceCents: 12500, summary: [{ label: "Color", value: "Green" }], stlKey: "models/x.3mf", imageUrl: null }],
  latestPayment: { reference: "GC1234567890", status: "verified", amountCents: 33000, proofKey: null, rejectReason: null, verifiedAt: new Date("2026-11-10T06:00:00Z") },
  shipment: null, history: [],
};
const html = (o: OrderDetail) => renderToStaticMarkup(createElement(Acknowledgment, { order: o, buyerName: "Ana Cruz", buyerEmail: "ana@example.com" }));

const h = html(base);
const text = h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
console.log("\ncontent");
assert("titled 'Order Acknowledgment'", /Order Acknowledgment/.test(text));
assert("shows the order number", text.includes("DC-20261110-ABC234"));
assert("shows item, qty, color option", text.includes("Outdoor Phone Stand") && text.includes("Color: Green"));
assert("line amount = 2 x ₱125.00 = ₱250.00", text.includes("₱250.00"));
assert("subtotal / shipping / total correct", text.includes("₱250.00") && text.includes("₱80.00") && text.includes("₱330.00"));
assert("VAT shown as ₱0.00", /VAT\s*₱0\.00/.test(text));
assert("shows the buyer and delivery address", text.includes("Ana Cruz") && text.includes("12 Mabini St") && text.includes("San Pablo"));
assert("verified payment: 'Paid and verified' + reference", text.includes("Paid and verified") && text.includes("GC1234567890"));

console.log("\nlegal wording (not a tax document)");
assert("never titled or headed 'Official Receipt'", !/<h1[^>]*>[^<]*official receipt/i.test(h) && !/uppercase[^>]*>[^<]*official receipt/i.test(h));
assert("states it is NOT an official receipt or tax invoice", /not an official receipt or a tax invoice/i.test(text));
assert("states no VAT was charged", /no VAT has been charged/i.test(text));
assert("does not claim a TIN / BIR registration / OR number", !/\bTIN\b|BIR (registered|permit|reg)|OR No|series no/i.test(text));

console.log("\nstates");
assert("awaiting payment is not shown as paid", (() => { const t = html({ ...base, status: "awaiting_payment", latestPayment: null }).replace(/<[^>]+>/g, " "); return t.includes("Awaiting payment") && !t.includes("Paid and verified"); })());
assert("a pending payment is not shown as paid", !html({ ...base, status: "awaiting_payment", latestPayment: { ...base.latestPayment!, status: "pending", verifiedAt: null } }).includes("Paid and verified"));
assert("redacted address (deleted account) doesn't print 'undefined'", (() => { const t = html({ ...base, shipAddress: { redacted: true } }).replace(/<[^>]+>/g, " "); return t.includes("address removed") && !t.includes("undefined"); })());
assert("HTML-escapes a hostile customer name", !renderToStaticMarkup(createElement(Acknowledgment, { order: base, buyerName: "<script>alert(1)</script>", buyerEmail: "a@b.c" })).includes("<script>alert"));

if (failures) { console.error(`\n${failures} assertion(s) failed`); process.exit(1); }
console.log("\nAll acknowledgment checks passed.");
