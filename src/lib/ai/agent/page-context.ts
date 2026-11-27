/**
 * What the admin is looking at, in words the agent can use. The browser sends only the path and query string; everything
 * about the page's record is read here from the database, so the browser cannot make the agent "see" something false.
 * SERVER ONLY.
 */
import { toolByName } from "./tools";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

const SECTIONS: [RegExp, string, string][] = [
  [/^\/admin\/?$/, "Dashboard", "The dashboard: revenue, orders and stock at a glance."],
  [/^\/admin\/products\/new/, "New product", "The form for adding a product."],
  [/^\/admin\/products\/?$/, "Products", "The list of all products and services."],
  [/^\/admin\/orders\/?$/, "Orders", "The list of online orders with status filters."],
  [/^\/admin\/payments/, "Payments", "The queue of GCash payments waiting for verification. (Verifying payments is a human job; the agent cannot do it.)"],
  [/^\/admin\/reviews/, "Reviews", "Customer reviews to moderate."],
  [/^\/admin\/colours/, "Colours", "The colour (filament) inventory that products can use."],
  [/^\/admin\/shipping/, "Shipping", "The shipping rate table (zones by weight)."],
  [/^\/admin\/studio/, "Design studio", "The clicker and name keychain designers, used to make print files for off-site orders."],
  [/^\/admin\/estimator/, "Estimator", "The price estimator: cost plus three prices."],
  [/^\/admin\/inventory/, "Inventory", "Parts, stock levels and purchases."],
  [/^\/admin\/sales/, "Off-site sales", "The log of sales made outside the website."],
  [/^\/admin\/ai\/settings/, "AI settings", "Provider keys and model choices."],
  [/^\/admin\/ai/, "Product studio", "The product studio: one chat per product for its listing, mockups, price, designs and options."],
  [/^\/admin\/users/, "Users", "Customer accounts."],
  [/^\/admin\/(content|branding|store|legal)/, "Site content", "Landing page, branding, store info or legal pages."],
];

export type PageInfo = { label: string; text: string };

export async function describePage(path: string, search = ""): Promise<PageInfo> {
  const clean = path.split("?")[0].slice(0, 200);
  const product = new RegExp(`^/admin/products/(${UUID})`, "i").exec(clean);
  if (product) {
    const data = (await toolByName("get_product")?.run?.({ productId: product[1] } as never)) ?? { error: "unavailable" };
    return { label: "Product page", text: `The product editor for this product (its id is ${product[1]}). Details:\n${JSON.stringify(data)}` };
  }
  const order = new RegExp(`^/admin/orders/(${UUID})`, "i").exec(clean);
  if (order) {
    const data = (await toolByName("get_order")?.run?.({ orderId: order[1] } as never)) ?? { error: "unavailable" };
    const sub = /\/(acknowledgment|job-sheet|waybill)/.exec(clean)?.[1];
    return { label: "Order page", text: `The order page${sub ? ` (${sub} view)` : ""} for this order (its id is ${order[1]}). Details:\n${JSON.stringify(data)}` };
  }
  const hit = SECTIONS.find(([re]) => re.test(clean));
  // the address comes from the browser and goes into the prompt: only known filter names, and only plain characters in their values
  const q = new URLSearchParams(search.slice(0, 300));
  const filters = ["status", "q", "page", "tool", "category"].flatMap((k) => { const v = q.get(k); return v && /^[\w .@-]{1,40}$/.test(v) ? [`${k}=${v}`] : []; }).join(", ");
  if (hit) return { label: hit[1], text: `${hit[2]}${filters ? ` Filters in the address: ${filters}.` : ""}` };
  return { label: "Admin", text: "An admin page." };
}
