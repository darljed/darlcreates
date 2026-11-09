import { Suspense } from "react";
import { SignInCard } from "@/components/sign-in-card";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-20">
      <Suspense>
        <SignInCard />
      </Suspense>
    </main>
  );
}
