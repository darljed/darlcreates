/**
 * The "design your own" services (generators): what each is called, where it lives, and which of them are actually set
 * up (a service whose product has not been created yet is not shown, so no link leads to a 404). Used by the landing
 * page, the footer, /services and the call-to-action bands.
 */
import { cacheLife, cacheTag } from "next/cache";
import { findClickerProductSlug, findKeychainProductSlug } from "./catalog";

export const SERVICES = [
  { id: "keychain", href: "/keychain", title: "Name keychain", blurb: "Type a name, pick a cute font, an animal or charm icon, colours and thickness. We print it.", cta: "Make a keychain" },
  { id: "clicker", href: "/clicker", title: "Custom clicker", blurb: "Design a clicker with your own text or picture, in any shape and colour, with a real switch fitted.", cta: "Design a clicker" },
] as const;
export type ServiceId = (typeof SERVICES)[number]["id"];

/** The services that are set up and published right now, in display order. */
export async function listServices(): Promise<(typeof SERVICES)[number][]> {
  "use cache";
  cacheLife("hours");
  cacheTag("products");
  const [keychain, clicker] = await Promise.all([findKeychainProductSlug(), findClickerProductSlug()]);
  const on = new Set<ServiceId>([...(keychain ? (["keychain"] as const) : []), ...(clicker ? (["clicker"] as const) : [])]);
  return SERVICES.filter((s) => on.has(s.id));
}
