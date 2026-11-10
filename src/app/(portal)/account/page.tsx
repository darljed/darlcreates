import { Suspense } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddressBook, DeleteAccount } from "@/components/account-panels";
import { PageHeader, Panel } from "@/components/shell/ui";
import { listAddresses } from "@/lib/addresses";
import { requireUser } from "@/lib/session";

export const metadata = { title: "My account" };
export const instant = false;

export default function AccountPage() {
  return (
    <div className="max-w-3xl">
      <PageHeader title="My account" />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <AccountContents />
      </Suspense>
    </div>
  );
}

async function AccountContents() {
  const user = await requireUser("/account");
  const addresses = await listAddresses(user.id);
  return (
    <div className="space-y-5">
      <Panel title="Profile">
        <p className="text-sm">{user.name} · {user.email}</p>
        <p className="mt-1 text-xs text-muted-foreground">Signed in with Google. Update your name or email in your Google account.</p>
      </Panel>
      <Panel title="Saved addresses">
        <AddressBook addresses={addresses} />
      </Panel>
      <Panel title="Your data" description="Download a copy of everything we hold about you (profile, addresses, orders, reviews).">
        <Button asChild variant="outline"><a href="/account/export" download><Download className="mr-2 size-4" /> Download my data (JSON)</a></Button>
      </Panel>
      <Panel title="Delete account">
        <DeleteAccount />
      </Panel>
    </div>
  );
}
