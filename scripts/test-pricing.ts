/**
 * Self-check for lib/pricing — server-authoritative price + validation.
 * No DB. Run: npx tsx scripts/test-pricing.ts
 */
import { computeUnitPrice, type ProductOptionInput } from "../src/lib/pricing";

let failures = 0;
function assert(name: string, cond: boolean) {
  if (!cond) {
    failures++;
    console.error(`  ✗ ${name}`);
  } else {
    console.log(`  ✓ ${name}`);
  }
}

const color: ProductOptionInput = {
  id: "opt-color",
  type: "color",
  label: "Color",
  required: true,
  priceDeltaCents: 0,
  constraints: {},
  values: [
    { id: "c-pink", label: "Pink", value: "#f0f", priceDeltaCents: 0 },
    { id: "c-gold", label: "Gold", value: "#fc0", priceDeltaCents: 5000 },
  ],
};
const size: ProductOptionInput = {
  id: "opt-size",
  type: "size",
  label: "Size",
  required: true,
  priceDeltaCents: 0,
  constraints: {},
  values: [
    { id: "s-reg", label: "Regular", value: "reg", priceDeltaCents: 0 },
    { id: "s-lg", label: "Large", value: "lg", priceDeltaCents: 7000 },
  ],
};
const engraving: ProductOptionInput = {
  id: "opt-text",
  type: "text",
  label: "Engraving",
  required: false,
  priceDeltaCents: 3000,
  constraints: { maxLen: 10, pattern: "^[A-Za-z0-9 ]*$" },
  values: [],
};
const BASE = 15000;
const opts = [color, size, engraving];

// Valid minimal selection (required only)
{
  const r = computeUnitPrice(BASE, opts, {
    "opt-color": { valueId: "c-pink" },
    "opt-size": { valueId: "s-reg" },
  });
  assert("valid minimal has no errors", r.errors.length === 0);
  assert("minimal price = base", r.unitPriceCents === 15000);
}

// Value deltas add up (gold + large)
{
  const r = computeUnitPrice(BASE, opts, {
    "opt-color": { valueId: "c-gold" },
    "opt-size": { valueId: "s-lg" },
  });
  assert("gold+large price = 15000+5000+7000", r.unitPriceCents === 27000);
}

// Optional text with content adds the option delta (+3000)
{
  const r = computeUnitPrice(BASE, opts, {
    "opt-color": { valueId: "c-pink" },
    "opt-size": { valueId: "s-reg" },
    "opt-text": { text: "DARL" },
  });
  assert("engraving adds +3000", r.unitPriceCents === 18000);
  assert("valid engraving no errors", r.errors.length === 0);
}

// Missing required option -> error
{
  const r = computeUnitPrice(BASE, opts, { "opt-color": { valueId: "c-pink" } });
  assert("missing size errors", r.errors.some((e) => e.includes("Size")));
}

// Text too long -> error
{
  const r = computeUnitPrice(BASE, opts, {
    "opt-color": { valueId: "c-pink" },
    "opt-size": { valueId: "s-reg" },
    "opt-text": { text: "THISISWAYTOOLONG" },
  });
  assert("overlong text errors", r.errors.some((e) => e.includes("max")));
}

// Disallowed characters -> error
{
  const r = computeUnitPrice(BASE, opts, {
    "opt-color": { valueId: "c-pink" },
    "opt-size": { valueId: "s-reg" },
    "opt-text": { text: "no@good" },
  });
  assert("bad chars error", r.errors.some((e) => e.includes("disallowed")));
}

// Invalid value id -> error, not silently priced
{
  const r = computeUnitPrice(BASE, opts, {
    "opt-color": { valueId: "does-not-exist" },
    "opt-size": { valueId: "s-reg" },
  });
  assert("invalid choice errors", r.errors.some((e) => e.includes("invalid")));
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll pricing self-checks passed.");
