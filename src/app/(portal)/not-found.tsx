import { NotFoundView } from "@/components/not-found-view";

export const metadata = { title: "Not found" };

/** notFound() inside the customer area (e.g. an order that isn't yours): stays inside the account shell. */
export default function PortalNotFound() {
  return (
    <NotFoundView
      title="We couldn't find that"
      message="This order or page doesn't exist on your account."
      primary={{ href: "/orders", label: "My orders" }}
      secondary={{ href: "/products", label: "Browse the shop" }}
    />
  );
}
