/**
 * The Order Acknowledgment shows the real order numbers and amounts, and never mentions the store's tax or
 * registration status (the owner doesn't want that discussed anywhere on the site). Static render (no browser). Run: npx tsx scripts/test-acknowledgment.ts
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
  id: "o1", userId: "u1", orderNo: "DC-20261110-ABC234", status: "paid", subtotalCents: 25000, shippingCents: 8000, totalCents: 33000,
  placedAt: new Date("2026-11-10T04:00:00Z"),
  shipAddress: { recipient: "Ana Cruz", phone: "09171234567", line1: "12 Mabini St", city: "San Pablo", province: "Laguna", postalCode: "4000" },
  items: [{ id: "i1", name: "Outdoor Phone Stand", slug: "outdoor-phone-stand", qty: 2, unitPriceCents: 12500, summary: [{ label: "Color", value: "Green" }], stlKey: "models/x.3mf", nameText: null, imageUrl: null }],
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
assert("shows the buyer and delivery address", text.includes("Ana Cruz") && text.includes("12 Mabini St") && text.includes("San Pablo"));
assert("verified payment: 'Paid and verified' + reference", text.includes("Paid and verified") && text.includes("GC1234567890"));

console.log("\nwording");
assert("the document title is the page's <h1>", /<h1[^>]*>Order Acknowledgment<\/h1>/.test(h));
assert("exactly one <h1>", (h.match(/<h1[ >]/g) ?? []).length === 1);
assert("never mentions registration, receipts, invoices, VAT or TIN", !/\bBIR\b|registered|receipt|invoice|\bVAT\b|\bTIN\b|tax/i.test(text), text.match(/\bBIR\b|registered|receipt|invoice|\bVAT\b|\bTIN\b|tax/i)?.[0]);
assert("has no VAT row (a table row just for it)", !/VAT/i.test(h));
assert("says what it is: a confirmation of the order", /confirms that we received your order/i.test(text));

console.log("\nstates");
assert("awaiting payment is not shown as paid", (() => { const t = html({ ...base, status: "awaiting_payment", latestPayment: null }).replace(/<[^>]+>/g, " "); return t.includes("Awaiting payment") && !t.includes("Paid and verified"); })());
assert("a pending payment is not shown as paid", !html({ ...base, status: "awaiting_payment", latestPayment: { ...base.latestPayment!, status: "pending", verifiedAt: null } }).includes("Paid and verified"));
assert("redacted address (deleted account) doesn't print 'undefined'", (() => { const t = html({ ...base, shipAddress: { redacted: true } }).replace(/<[^>]+>/g, " "); return t.includes("address removed") && !t.includes("undefined"); })());
assert("HTML-escapes a hostile customer name", !renderToStaticMarkup(createElement(Acknowledgment, { order: base, buyerName: "<script>alert(1)</script>", buyerEmail: "a@b.c" })).includes("<script>alert"));

if (failures) { console.error(`\n${failures} assertion(s) failed`); process.exit(1); }
console.log("\nAll acknowledgment checks passed.");
