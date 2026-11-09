/**
 * Self-check for lib/money — the centavos ↔ ₱ core. No DB, no framework.
 * Run: npx tsx scripts/test-money.ts
 */
import {
  formatPHP,
  pesosToCentavos,
  centavosToPesos,
  parsePesoInput,
  sumCentavos,
} from "../src/lib/money";

let failures = 0;
function assert(name: string, cond: boolean) {
  if (!cond) {
    failures++;
    console.error(`  ✗ ${name}`);
  } else {
    console.log(`  ✓ ${name}`);
  }
}

// formatPHP
assert("formats 25000c as ₱250.00", formatPHP(25000) === "₱250.00");
assert("formats 0c as ₱0.00", formatPHP(0) === "₱0.00");
assert("rounds half-centavo input", formatPHP(25050.4) === "₱250.50");
assert("non-finite falls back to ₱0.00", formatPHP(NaN) === "₱0.00");

// pesos <-> centavos (no float drift)
assert("250.50 pesos -> 25050c", pesosToCentavos(250.5) === 25050);
assert("0.1+0.2 pesos -> 30c (no drift)", pesosToCentavos(0.1 + 0.2) === 30);
assert("25050c -> 250.5 pesos", centavosToPesos(25050) === 250.5);

// parsePesoInput
assert('parses "250" -> 25000c', parsePesoInput("250") === 25000);
assert('parses "₱1,250.50" -> 125050c', parsePesoInput("₱1,250.50") === 125050);
assert('rejects "abc"', parsePesoInput("abc") === null);
assert('rejects negative "-5"', parsePesoInput("-5") === null);
assert('rejects 3 decimals "1.234"', parsePesoInput("1.234") === null);

// sumCentavos
assert("sums [100,250,50] -> 400", sumCentavos([100, 250, 50]) === 400);
assert("sums [] -> 0", sumCentavos([]) === 0);

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll money self-checks passed.");
