import { Suspense } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddressBook, DeleteAccount } from "@/components/account-panels";
import { listAddresses } from "@/lib/addresses";
import { requireUser } from "@/lib/session";

export const metadata = { title: "My account" };

export default function AccountPage() {
  return (
    <main className="flex-1">
      <div className="mx-auto max-w-3xl space-y-10 px-6 py-10">
        <h1 className="text-3xl font-extrabold">My account</h1>
        <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
          <AccountContents />
        </Suspense>
      </div>
    </main>
  );
}

async function AccountContents() {
  const user = await requireUser("/account");
  const addresses = await listAddresses(user.id);
  return (
    <>
      <section className="space-y-1">
        <h2 className="text-xl font-bold">Profile</h2>
        <p className="text-sm text-muted-foreground">{user.name} · {user.email}</p>
        <p className="text-xs text-muted-foreground">Signed in with Google. Update your name or email in your Google account.</p>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-bold">Saved addresses</h2>
        <AddressBook addresses={addresses} />
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-bold">Your data</h2>
        <p className="text-sm text-muted-foreground">Download a copy of everything we hold about you (profile, addresses, orders, reviews).</p>
        <Button asChild variant="outline"><a href="/account/export" download><Download className="mr-2 size-4" /> Download my data (JSON)</a></Button>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-bold">Delete account</h2>
        <DeleteAccount />
      </section>
    </>
  );
}
