/**
 * Storefront header: logo, navigation, cart badge and account menu. On phones the text links collapse (Shop becomes an icon;
 * My Orders and Admin live in the account menu) so the logo is never squeezed.
 */
import Link from "next/link";
import { ShoppingBag, Store } from "lucide-react";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { cartItemCount } from "@/lib/cart";
import { UserMenu } from "./user-menu";
import { Button } from "./ui/button";
import { BrandLogo } from "./brand-logo";

function HeaderShell({ children }: { children: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-40 border-b-2 border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-4 sm:px-6">
        {/* shrink-0: the logo keeps its natural width; the nav is what gives way on a phone */}
        <Link href="/" className="flex shrink-0 items-center" aria-label="Darl Creates home">
          <BrandLogo variant="horizontal" className="h-8 max-[360px]:h-7 sm:h-9" priority />
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">{children}</nav>
      </div>
    </header>
  );
}

/** "Shop" as an icon on phones (saves ~20px next to the logo) and as text from the sm breakpoint. */
function ShopLink() {
  return (
    <>
      <Button asChild variant="ghost" size="icon" className="sm:hidden" aria-label="Shop">
        <Link href="/products"><Store className="size-5" /></Link>
      </Button>
      <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
        <Link href="/products">Shop</Link>
      </Button>
    </>
  );
}

/** Static fallback shown while the session resolves (streamed). */
export function SiteHeaderSkeleton() {
  return (
    <HeaderShell>
      <ShopLink />
      <Button asChild variant="ghost" size="icon" aria-label="Cart">
        <Link href="/cart">
          <ShoppingBag className="size-5" />
        </Link>
      </Button>
      <div className="size-9 rounded-full bg-muted" aria-hidden />
    </HeaderShell>
  );
}

export async function SiteHeader() {
  const user = await getCurrentUser();
  const count = user ? await cartItemCount(user.id) : 0;

  return (
    <HeaderShell>
      <ShopLink />
      {user && (
        <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
          <Link href="/orders">My Orders</Link>
        </Button>
      )}
      {isAdmin(user) && (
        <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
          <Link href="/admin">Admin</Link>
        </Button>
      )}
      <Button asChild variant="ghost" size="icon" className="relative" aria-label={count ? `Cart, ${count} item${count === 1 ? "" : "s"}` : "Cart"}>
        <Link href="/cart">
          <ShoppingBag className="size-5" />
          {count > 0 && (
            <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] font-bold leading-4 text-primary-foreground">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </Link>
      </Button>
      {user ? (
        <UserMenu
          name={user.name}
          email={user.email}
          image={user.image ?? null}
          isAdmin={isAdmin(user)}
        />
      ) : (
        <Button
          asChild
          size="sm"
          className="bg-primary text-primary-foreground"
        >
          <Link href="/sign-in">Sign in</Link>
        </Button>
      )}
    </HeaderShell>
  );
}
