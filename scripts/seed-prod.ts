/**
 * Seed a fresh production DB: the landing-page content, the one clicker product, and the owner as admin. Nothing else
 * goes in the shop. Idempotent (upserts). Usage:
 *   TARGET_DATABASE_URL=postgres://... npx tsx scripts/seed-prod.ts [owner@email]
 * Source = DATABASE_URL from .env.local (the dev DB). The admin row is created ahead of the first Google sign-in; it
 * links by email because email_verified is true.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const src = postgres(process.env.DATABASE_URL!, { max: 1 });
const dst = postgres(process.env.TARGET_DATABASE_URL!, { max: 1, prepare: false });
const email = process.argv[2] ?? "darljedmatundan@gmail.com";

async function main() {
  // 1) landing page content (key "site"), without the editor's user id
  const [site] = await src`select data from site_content where key = 'site'`;
  if (!site) throw new Error("no site content in the source DB");
  await dst`insert into site_content (key, data) values ('site', ${dst.json(site.data)})
            on conflict (key) do update set data = excluded.data, updated_at = now()`;

  // 2) the clicker product (+ its single "Your clicker" option); no photos, no other products
  const [p] = await src`select * from products where slug = 'custom-clicker'`;
  const [o] = await src`select * from product_options where product_id = ${p.id} and constraints ? 'clicker'`;
  const [np] = await dst`insert into products (slug, name, description, category, base_price_cents, status)
      values (${p.slug}, ${p.name}, ${p.description}, ${p.category}, ${p.base_price_cents}, ${p.status})
      on conflict (slug) do update set name = excluded.name, description = excluded.description, updated_at = now()
      returning id`;
  await dst`delete from product_options where product_id = ${np.id}`;
  await dst`insert into product_options (product_id, type, label, required, price_delta_cents, constraints, sort)
      values (${np.id}, ${o.type}, ${o.label}, ${o.required}, ${o.price_delta_cents}, ${dst.json(o.constraints)}, ${o.sort})`;

  // 3) owner as admin
  await dst`insert into users (id, name, email, email_verified, role, created_at, updated_at)
            values (${crypto.randomUUID()}, 'Darl Jed Matundan', ${email}, true, 'admin', now(), now())
            on conflict (email) do update set role = 'admin'`;

  const [c] = await dst`select (select count(*) from products)::int products, (select count(*) from site_content)::int content,
                               (select role from users where email = ${email}) role`;
  console.log(c);
  await src.end(); await dst.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
