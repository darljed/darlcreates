/**
 * Promote a user to admin by email. Run after the user has signed in once.
 * Usage: npx tsx scripts/make-admin.ts you@example.com
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { eq } from "drizzle-orm";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: npx tsx scripts/make-admin.ts <email>");
    process.exit(1);
  }
  const { db } = await import("../src/db");
  const { users } = await import("../src/db/schema");

  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) {
    console.error(
      `No user with email ${email}. Sign in with Google once, then re-run.`,
    );
    process.exit(1);
  }
  await db.update(users).set({ role: "admin" }).where(eq(users.id, user.id));
  console.log(`✓ ${email} is now an admin.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
