/**
 * Order vocabulary: status labels, the allowed forward transitions (ORDER_TRANSITIONS), the order-number generator
 * and the revenue filter.
 */
import { db } from "@/db";
import {
  orders,
  orderItems,
  orderStatusHistory,
  payments,
  shipments,
  type orderStatus,
} from "@/db/schema";
import { randomInt } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getProductById } from "./catalog";
import { summarizeConfig } from "./cart";
import { personalizedName } from "./name-mesh";
import { readUrl } from "./storage";
import type { ConfigSelection } from "./pricing";

export type OrderStatus = (typeof orderStatus.enumValues)[number];

/** Allowed forward transitions (admin-driven). */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  awaiting_payment: ["paid", "cancelled"],
  paid: ["in_production", "refunded", "cancelled"],
  in_production: ["ready_to_ship", "cancelled"],
  ready_to_ship: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
  refunded: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

const ORDER_NO_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

/**
 * Human order number like DC-20261109-K7M2QX. Date is the PH business day; the suffix is
 * 6 chars from a crypto RNG (32^6 ~ 1.07B per day). A collision is still possible in
 * theory, so the DB column is UNIQUE and placeOrder retries on a unique violation.
 */
export function generateOrderNo(now: Date = new Date()): string {
  const ymd = now
    .toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }) // YYYY-MM-DD
    .replaceAll("-", "");
  let suffix = "";
  for (let i = 0; i < 6; i++) suffix += ORDER_NO_ALPHABET[randomInt(ORDER_NO_ALPHABET.length)];
  return `DC-${ymd}-${suffix}`;
}

export type OrderDetail = {
  id: string;
  /** The customer who placed it (for the admin to jump to their account). */
  userId: string;
  orderNo: string;
  status: OrderStatus;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  placedAt: Date;
  shipAddress: Record<string, unknown>;
  items: {
    id: string;
    name: string;
    /** Storefront slug for "review this" / "buy again" links; null if the product is gone. */
    slug: string | null;
    qty: number;
    unitPriceCents: number;
    summary: { label: string; value: string }[];
    stlKey: string | null;
    /** The customer's name that is added to the model at download time (see name-3mf.ts), if this product has a name slot. */
    nameText: string | null;
    imageUrl: string | null;
  }[];
  latestPayment: {
    reference: string;
    status: string;
    amountCents: number;
    proofKey: string | null;
    rejectReason: string | null;
    verifiedAt: Date | null;
  } | null;
  shipment: { carrier: string; trackingNo: string; status: string } | null;
  history: { toStatus: string; note: string; createdAt: Date }[];
};

async function assembleOrderDetail(
  order: typeof orders.$inferSelect,
): Promise<OrderDetail> {
  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id));

  const detailItems: OrderDetail["items"] = [];
  for (const it of items) {
    const product = await getProductById(it.productId);
    const config = (it.config ?? {}) as ConfigSelection;
    detailItems.push({
      id: it.id,
      name: it.nameSnapshot,
      slug: product?.slug ?? null,
      qty: it.qty,
      unitPriceCents: it.unitPriceCents,
      summary: product ? summarizeConfig(product.options, config) : [],
      stlKey: it.stlKeySnapshot,
      nameText: product ? (personalizedName(product.options, config, it.stlKeySnapshot)?.text ?? null) : null,
      imageUrl: await readUrl(it.imageKey),
    });
  }

  const [pay] = await db
    .select()
    .from(payments)
    .where(eq(payments.orderId, order.id))
    .orderBy(desc(payments.submittedAt))
    .limit(1);

  const [ship] = await db
    .select()
    .from(shipments)
    .where(eq(shipments.orderId, order.id))
    .limit(1);

  const history = await db
    .select()
    .from(orderStatusHistory)
    .where(eq(orderStatusHistory.orderId, order.id))
    .orderBy(desc(orderStatusHistory.createdAt));

  return {
    id: order.id,
    userId: order.userId,
    orderNo: order.orderNo,
    status: order.status,
    subtotalCents: order.subtotalCents,
    shippingCents: order.shippingCents,
    totalCents: order.totalCents,
    placedAt: order.placedAt,
    shipAddress: order.shipAddress as Record<string, unknown>,
    items: detailItems,
    latestPayment: pay
      ? {
          reference: pay.gcashReference,
          status: pay.status,
          amountCents: pay.amountCents,
          proofKey: pay.proofKey,
          rejectReason: pay.rejectReason,
          verifiedAt: pay.verifiedAt,
        }
      : null,
    shipment: ship
      ? { carrier: ship.carrier, trackingNo: ship.trackingNo, status: ship.status }
      : null,
    history: history.map((h) => ({
      toStatus: h.toStatus,
      note: h.note,
      createdAt: h.createdAt,
    })),
  };
}

export async function getOrderForUser(
  orderNo: string,
  userId: string,
): Promise<OrderDetail | null> {
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.orderNo, orderNo), eq(orders.userId, userId)))
    .limit(1);
  if (!order) return null;
  return assembleOrderDetail(order);
}

export async function getOrderByIdAdmin(id: string): Promise<OrderDetail | null> {
  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) return null;
  return assembleOrderDetail(order);
}

export type UserOrderRow = {
  id: string;
  orderNo: string;
  status: OrderStatus;
  totalCents: number;
  placedAt: Date;
  /** "2× Desk Clicker, Name Keychain": one line for the list view. */
  itemsLabel: string;
  /** A GCash reference was submitted and is waiting for the owner. */
  paymentPending: boolean;
};

export async function listUserOrders(userId: string): Promise<UserOrderRow[]> {
  const rows = await db
    .select({
      id: orders.id,
      orderNo: orders.orderNo,
      status: orders.status,
      totalCents: orders.totalCents,
      placedAt: orders.placedAt,
    })
    .from(orders)
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.placedAt));
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const items = await db
    .select({ orderId: orderItems.orderId, name: orderItems.nameSnapshot, qty: orderItems.qty })
    .from(orderItems)
    .where(inArray(orderItems.orderId, ids));
  const pending = await db
    .select({ orderId: payments.orderId })
    .from(payments)
    .where(and(inArray(payments.orderId, ids), eq(payments.status, "pending")));
  const pendingSet = new Set(pending.map((p) => p.orderId));

  return rows.map((r) => ({
    ...r,
    itemsLabel: items.filter((i) => i.orderId === r.id).map((i) => `${i.qty}× ${i.name}`).join(", "),
    paymentPending: pendingSet.has(r.id),
  }));
}
