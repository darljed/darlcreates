/**
 * Shipping fee — the ONE place it is defined, used by the checkout display and
 * by order placement, so what the customer sees is what is charged (gap G-08).
 * ponytail: flat fee for v1. Upgrade path: a per-province/zone table keyed off the
 * shipping address, with the same function signature.
 */
export const FLAT_SHIPPING_CENTS = 8000; // ₱80.00

export function shippingCentsFor(subtotalCents: number): number {
  void subtotalCents; // flat for now; the parameter exists so callers don't change when this becomes zone/threshold based
  return FLAT_SHIPPING_CENTS;
}
