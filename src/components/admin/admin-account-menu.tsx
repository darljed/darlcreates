"use client";

import { useRouter } from "next/navigation";
import { ChevronsUpDown, ExternalLink, LogOut, User as UserIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/lib/auth-client";

/**
 * Admin account menu. `variant="sidebar"` shows name + email as the trigger (the email is the
 * clickable part); `variant="avatar"` is a compact avatar for the top bar, which stays reachable
 * when the sidebar is collapsed.
 */
export function AdminAccountMenu({
  name,
  email,
  image,
  variant,
}: {
  name: string;
  email: string;
  image: string | null;
  variant: "sidebar" | "avatar";
}) {
  const router = useRouter();
  const initials = name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

  const avatar = (
    <Avatar className={variant === "avatar" ? "size-7 border-2 border-primary" : "size-8"}>
      {image && <AvatarImage src={image} alt="" />}
      <AvatarFallback className="bg-accent text-xs font-bold text-accent-foreground">
        {initials || <UserIcon className="size-3.5" />}
      </AvatarFallback>
    </Avatar>
  );

  return (
    <DropdownMenu>
      {variant === "sidebar" ? (
        <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left outline-none hover:bg-background/60 focus-visible:ring-2 focus-visible:ring-ring">
          {avatar}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold">{name}</span>
            <span className="block truncate text-[11px] text-muted-foreground">{email}</span>
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="sr-only">Account menu</span>
        </DropdownMenuTrigger>
      ) : (
        <DropdownMenuTrigger
          aria-label="Account menu"
          className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {avatar}
        </DropdownMenuTrigger>
      )}
      <DropdownMenuContent align={variant === "sidebar" ? "start" : "end"} side={variant === "sidebar" ? "top" : "bottom"} className="w-56">
        <DropdownMenuLabel>
          <div className="truncate font-semibold">{name}</div>
          <div className="truncate text-xs font-normal text-muted-foreground">{email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push("/account")}>
          <UserIcon className="mr-2 size-4" /> My account
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => window.open("/", "_blank", "noopener")}>
          <ExternalLink className="mr-2 size-4" /> View storefront
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await signOut();
            router.push("/");
            router.refresh();
          }}
        >
          <LogOut className="mr-2 size-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
