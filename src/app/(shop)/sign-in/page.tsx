import { NOINDEX } from "@/lib/seo";
import { Suspense } from "react";
import { SignInCard } from "@/components/sign-in-card";
import { BrandLogo } from "@/components/brand-logo";

export const metadata = { title: "Sign in", ...NOINDEX };

export default function SignInPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-20">
      <Suspense>
        <SignInCard logo={<BrandLogo variant="icon" className="mx-auto h-16" />} />
      </Suspense>
    </main>
  );
}
