/**
 * Shipping fee — the ONE place it is defined, used by the checkout display and
 * by order placement, so what the customer sees is what is charged (gap G-08).
 * ponytail: flat fee for v1. Upgrade path: a per-province/zone table keyed off the
 * shipping address, with the same function signature.
 */
export const FLAT_SHIPPING_CENTS = 8000; // ₱80.00

export function shippingCentsFor(_subtotalCents: number): number {
  return FLAT_SHIPPING_CENTS;
}
