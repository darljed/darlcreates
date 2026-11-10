import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { cartItemCount } from "@/lib/cart";
import { UserMenu } from "./user-menu";

/** Top-bar cart link + account menu for the customer area. Streams in behind a Suspense boundary. */
export async function PortalUser() {
  const user = await getCurrentUser();
  if (!user) return null; // pages redirect signed-out visitors; nothing to show meanwhile
  const count = await cartItemCount(user.id);
  return (
    <div className="flex items-center gap-2">
      <Link
        href="/cart"
        aria-label={count ? `Cart, ${count} item${count === 1 ? "" : "s"}` : "Cart"}
        className="relative rounded-md p-1.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ShoppingBag className="size-5" aria-hidden />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] font-bold leading-4 text-primary-foreground">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Link>
      <UserMenu name={user.name} email={user.email} image={user.image ?? null} />
    </div>
  );
}
