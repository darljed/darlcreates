import { db } from "@/db";
import {
  orders,
  orderItems,
  orderStatusHistory,
  payments,
  shipments,
  type orderStatus,
} from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { getProductById } from "./catalog";
import { summarizeConfig } from "./cart";
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

/** Generate a human order number like DC-20261109-AB12. */
export function generateOrderNo(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate(),
  ).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `DC-${ymd}-${rand}`;
}

export type OrderDetail = {
  id: string;
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
    qty: number;
    unitPriceCents: number;
    summary: { label: string; value: string }[];
    stlKey: string | null;
    imageUrl: string | null;
  }[];
  latestPayment: {
    reference: string;
    status: string;
    amountCents: number;
    proofKey: string | null;
    rejectReason: string | null;
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
      qty: it.qty,
      unitPriceCents: it.unitPriceCents,
      summary: product ? summarizeConfig(product.options, config) : [],
      stlKey: it.stlKeySnapshot,
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

export async function listUserOrders(userId: string) {
  return db
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
}
