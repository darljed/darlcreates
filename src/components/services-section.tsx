/**
 * The "design your own" services as cards (full) or as a slim call-to-action band (compact). Shown on the landing page,
 * /services, the shop and the empty cart. Renders nothing when no service is set up.
 */
import Link from "next/link";
import { ArrowRight, KeyRound, MousePointerClick, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listServices, type ServiceId } from "@/lib/services";

const ICON: Record<ServiceId, typeof KeyRound> = { keychain: KeyRound, clicker: MousePointerClick };

export async function ServicesSection({ variant = "full", heading = true }: { variant?: "full" | "compact"; heading?: boolean }) {
  const services = await listServices();
  if (services.length === 0) return null;

  if (variant === "compact") {
    return (
      <section aria-label="Design your own" className="rounded-xl border-2 border-primary/30 bg-primary/5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="flex items-center gap-1.5 text-lg font-extrabold"><Sparkles className="size-5 text-primary" aria-hidden /> Want something one of a kind?</p>
            <p className="text-sm text-muted-foreground">Design it yourself and see it in 3D before you order.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {services.map((s) => (
              <Button key={s.id} asChild className="bg-primary text-primary-foreground">
                <Link href={s.href}>{s.cta} <ArrowRight className="ml-1 size-4" /></Link>
              </Button>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Design your own" className="mx-auto max-w-6xl px-6 py-16">
      {heading && (
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-extrabold">Make it yours</h2>
            <p className="mt-1 text-muted-foreground">Design tools: build it in 3D, see the price as you go, and we print it to order.</p>
          </div>
          <Link href="/services" className="shrink-0 text-sm font-semibold text-primary hover:underline">All design tools</Link>
        </div>
      )}
      <div className="grid gap-6 md:grid-cols-2">
        {services.map((s) => {
          const Icon = ICON[s.id];
          return (
            <div key={s.id} className="group flex flex-col rounded-xl border-2 border-border bg-card p-6 transition-all hover:-translate-y-1 hover:border-primary hover:shadow-lg">
              <div className="mb-4 inline-flex w-fit rounded-lg bg-accent p-3 text-accent-foreground"><Icon className="size-6" aria-hidden /></div>
              <h3 className="text-xl font-bold">{s.title}</h3>
              <p className="mt-2 flex-1 text-muted-foreground">{s.blurb}</p>
              <Button asChild className="mt-5 w-fit bg-primary text-primary-foreground">
                <Link href={s.href}>{s.cta} <ArrowRight className="ml-1 size-4" /></Link>
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
