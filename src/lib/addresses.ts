/**
 * Saved address book: list, save (no duplicates, cap of 10, first is default), set default, delete (promotes
 * another default).
 */
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { addresses } from "@/db/schema";

export type SavedAddress = {
  id: string;
  label: string;
  recipient: string;
  phone: string;
  line1: string;
  line2: string;
  barangay: string;
  city: string;
  province: string;
  postalCode: string;
  isDefault: boolean;
};

export async function listAddresses(userId: string): Promise<SavedAddress[]> {
  const rows = await db
    .select()
    .from(addresses)
    .where(eq(addresses.userId, userId))
    .orderBy(desc(addresses.isDefault), asc(addresses.label));
  return rows.map((r) => ({ ...r, isDefault: r.isDefault === 1 }));
}

export async function deleteAddress(userId: string, id: string): Promise<boolean> {
  const removed = await db
    .delete(addresses)
    .where(and(eq(addresses.id, id), eq(addresses.userId, userId)))
    .returning({ id: addresses.id, wasDefault: addresses.isDefault });
  if (removed.length === 0) return false;
  if (removed[0].wasDefault === 1) {
    // promote another address so the book always has a default (if it has any address)
    const [next] = await db.select({ id: addresses.id }).from(addresses).where(eq(addresses.userId, userId)).limit(1);
    if (next) await db.update(addresses).set({ isDefault: 1 }).where(eq(addresses.id, next.id));
  }
  return true;
}

export async function setDefaultAddress(userId: string, id: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({ id: addresses.id })
      .from(addresses)
      .where(and(eq(addresses.id, id), eq(addresses.userId, userId)));
    if (!target) return false;
    await tx.update(addresses).set({ isDefault: 0 }).where(eq(addresses.userId, userId));
    await tx.update(addresses).set({ isDefault: 1 }).where(eq(addresses.id, id));
    return true;
  });
}
