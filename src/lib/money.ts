/**
 * Money is ALWAYS integer centavos (1 PHP = 100 centavos). Never floats.
 * This module is the single place that converts to/from display and parses
 * user input, so rounding behavior is consistent everywhere.
 */

const PHP = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});

/** Format integer centavos as a ₱ string, e.g. 25000 -> "₱250.00". */
export function formatPHP(centavos: number): string {
  if (!Number.isFinite(centavos)) return PHP.format(0);
  return PHP.format(Math.round(centavos) / 100);
}

/** Convert a peso amount (number) to integer centavos. */
export function pesosToCentavos(pesos: number): number {
  return Math.round(pesos * 100);
}

/** Convert integer centavos to a peso number (for display math only). */
export function centavosToPesos(centavos: number): number {
  return Math.round(centavos) / 100;
}

/**
 * Parse a free-text peso input ("250", "₱250.50", "1,250") to integer
 * centavos. Returns null if it isn't a valid non-negative amount.
 */
export function parsePesoInput(input: string): number | null {
  const cleaned = input.replace(/[₱,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const pesos = Number(cleaned);
  if (!Number.isFinite(pesos) || pesos < 0) return null;
  return pesosToCentavos(pesos);
}

/** Sum a list of integer-centavo amounts safely. */
export function sumCentavos(amounts: number[]): number {
  return amounts.reduce((acc, n) => acc + Math.round(n), 0);
}
