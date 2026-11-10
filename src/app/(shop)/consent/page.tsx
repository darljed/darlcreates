import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/session";
import { safeRedirect } from "@/lib/safe-redirect";
import { getLegal } from "@/lib/site-content";
import { acceptConsentAction } from "./actions";

export const metadata = { title: "Privacy consent" };

export default function ConsentPage({ searchParams }: PageProps<"/consent">) {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <Suspense>
        <ConsentCard searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function ConsentCard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const redirectTo = safeRedirect(typeof sp.redirect === "string" ? sp.redirect : "/");
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const policy = await getLegal("privacy");
  const showError = sp.error === "1";

  return (
    <Card className="w-full max-w-lg border-2">
      <CardHeader>
        <CardTitle className="text-2xl">One quick thing, {user.name.split(" ")[0]}</CardTitle>
        <p className="text-sm text-muted-foreground">
          To place orders we store your name, email, delivery address, order details and any images you upload,
          as described in our Privacy Policy (Data Privacy Act of 2012, RA 10173).
        </p>
      </CardHeader>
      <CardContent>
        <form action={acceptConsentAction} className="space-y-4">
          <input type="hidden" name="redirect" value={redirectTo} />
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="agree" className="mt-1 size-4" required />
            <span>
              I have read and agree to the{" "}
              <Link href="/privacy" target="_blank" className="font-semibold underline">Privacy Policy</Link>{" "}
              <span className="text-muted-foreground">({policy.effective || "current version"})</span>.
            </span>
          </label>
          {showError && <p role="alert" className="text-sm text-destructive">Please tick the box to continue.</p>}
          <Button type="submit" size="lg" className="w-full bg-primary text-primary-foreground">I agree, continue</Button>
          <p className="text-xs text-muted-foreground">
            You can download or delete your data any time from your Account page.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
