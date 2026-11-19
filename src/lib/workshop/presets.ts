/**
 * Estimator presets and labels shared by the browser and the server. Pure.
 */
export interface MaterialPreset {
  name: string;
  pricePerKg: number;
}

export const MATERIAL_PRESETS: MaterialPreset[] = [
  { name: "PLA", pricePerKg: 750 },
  { name: "PETG", pricePerKg: 900 },
  { name: "ABS", pricePerKg: 850 },
  { name: "TPU", pricePerKg: 1200 },
  { name: "Custom", pricePerKg: 0 },
];

export const TIER_LABELS = ["Economy", "Standard", "Premium"] as const;
export const PART_UNITS = ["piece", "g", "mL", "cm"] as const;
export type PartUnit = (typeof PART_UNITS)[number];
