import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { UserMenu } from "./user-menu";
import { Button } from "./ui/button";
import { BrandLogo } from "./brand-logo";

function HeaderShell({ children }: { children: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-40 border-b-2 border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center" aria-label="Darl Creates home">
          <BrandLogo variant="horizontal" className="h-9" priority />
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">{children}</nav>
      </div>
    </header>
  );
}

/** Static fallback shown while the session resolves (streamed). */
export function SiteHeaderSkeleton() {
  return (
    <HeaderShell>
      <Button asChild variant="ghost" size="sm">
        <Link href="/products">Shop</Link>
      </Button>
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

  return (
    <HeaderShell>
      <Button asChild variant="ghost" size="sm">
        <Link href="/products">Shop</Link>
      </Button>
      {user && (
        <Button asChild variant="ghost" size="sm">
          <Link href="/orders">My Orders</Link>
        </Button>
      )}
      {isAdmin(user) && (
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin">Admin</Link>
        </Button>
      )}
      <Button asChild variant="ghost" size="icon" aria-label="Cart">
        <Link href="/cart">
          <ShoppingBag className="size-5" />
        </Link>
      </Button>
      {user ? (
        <UserMenu
          name={user.name}
          email={user.email}
          image={user.image ?? null}
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
