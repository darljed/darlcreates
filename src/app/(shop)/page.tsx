import Link from "next/link";
import { ArrowRight, Boxes, Palette, Rocket, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function Home() {
  return (
    <main className="flex-1">
      {/* HERO — bold saturated block, oversized display type */}
      <section className="relative overflow-hidden bg-primary text-primary-foreground">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-accent/40 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-secondary/40 blur-3xl"
        />
        <div className="relative mx-auto max-w-6xl px-6 py-24 md:py-32">
          <Badge className="mb-6 bg-accent text-accent-foreground hover:bg-accent/90">
            <Sparkles className="mr-1 size-3.5" /> Designed & printed in the PH
          </Badge>
          <h1 className="max-w-4xl text-5xl font-extrabold leading-[1.02] tracking-tight md:text-7xl">
            Make it yours.
            <br />
            <span className="text-accent">We&apos;ll print it.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg/relaxed text-primary-foreground/90">
            Phone stands, keychains, clickers and more. Spin them in 3D, pick
            your colors and text, and get a one-of-a-kind print made just for
            you.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Button
              asChild
              size="lg"
              className="bg-accent text-accent-foreground hover:bg-accent/90 transition-transform hover:-translate-y-0.5 active:translate-y-0"
            >
              <Link href="/products">
                Shop the catalog <ArrowRight className="ml-1 size-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10"
            >
              <Link href="#how">How it works</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* VALUE PROPS */}
      <section id="how" className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              icon: Boxes,
              title: "See it in 3D",
              body: "Rotate and zoom the real print-ready model before you buy. No surprises.",
            },
            {
              icon: Palette,
              title: "Customize it",
              body: "Choose colors, add your name or text, pick a size. Price updates live.",
            },
            {
              icon: Rocket,
              title: "Fast turnaround",
              body: "Pay via GCash, we verify, print, and ship. Track every step.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="group rounded-xl border-2 border-border bg-card p-6 transition-all hover:-translate-y-1 hover:border-primary hover:shadow-lg"
            >
              <div className="mb-4 inline-flex rounded-lg bg-accent p-3 text-accent-foreground">
                <Icon className="size-6" />
              </div>
              <h3 className="text-xl font-bold">{title}</h3>
              <p className="mt-2 text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA band */}
      <section className="bg-secondary text-secondary-foreground">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-6 py-16 md:flex-row md:items-center md:justify-between">
          <h2 className="text-3xl font-extrabold md:text-4xl">
            Ready to design yours?
          </h2>
          <Button
            asChild
            size="lg"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Link href="/products">
              Browse products <ArrowRight className="ml-1 size-4" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-border py-10">
        <div className="mx-auto max-w-6xl px-6 text-sm text-muted-foreground">
          © 2026 Darl Creates · Custom 3D-printed goods ·
          Made in the Philippines
        </div>
      </footer>
    </main>
  );
}
