import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProductCard } from "@/components/product-card";
import { CmsLink, ICONS } from "@/components/cms";
import { JsonLd } from "@/components/json-ld";
import { faqLd, organizationLd, pageMetadata, websiteLd } from "@/lib/seo";
import { getBranding, getHomeContent, getSiteInfo } from "@/lib/site-content";
import { listPublishedProducts } from "@/lib/catalog";
import { fileUrl } from "@/lib/storage";

export async function generateMetadata() {
  const { seo } = await getSiteInfo();
  return pageMetadata({ title: seo.title, description: seo.description, path: "/", absoluteTitle: true });
}

/** Landing page. Every block of copy comes from Admin → Landing page (defaults in site-content-schema). */
export default async function Home() {
  const [c, info, { logos }] = await Promise.all([getHomeContent(), getSiteInfo(), getBranding()]);
  const products = c.featured.enabled
    ? [...(await listPublishedProducts())].sort((a, b) => b.createdAtMs - a.createdAtMs).slice(0, c.featured.limit)
    : [];
  const heroImage = fileUrl(c.hero.imageKey);

  const logoUrl = fileUrl(logos.favicon?.key) ?? "/brand/icon.png";

  return (
    <main className="flex-1">
      <JsonLd data={organizationLd(info, logoUrl)} />
      <JsonLd data={websiteLd(info)} />
      <JsonLd data={faqLd(c.faq)} />
      {c.announcement.enabled && c.announcement.text && (
        <div className="bg-accent px-6 py-2 text-center text-sm font-semibold text-accent-foreground">
          {c.announcement.href ? (
            <CmsLink href={c.announcement.href} className="hover:underline">
              {c.announcement.text}
            </CmsLink>
          ) : (
            c.announcement.text
          )}
        </div>
      )}

      {/* HERO */}
      <section className="relative overflow-hidden bg-primary text-primary-foreground">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-accent/40 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-secondary/40 blur-3xl" />
        <div className={`relative mx-auto grid max-w-6xl items-center gap-10 px-6 py-20 md:py-28 ${heroImage ? "md:grid-cols-[1.2fr_1fr]" : ""}`}>
          <div>
            {c.hero.badge && (
              <Badge className="mb-6 bg-accent text-accent-foreground hover:bg-accent/90">
                <Sparkles className="mr-1 size-3.5" /> {c.hero.badge}
              </Badge>
            )}
            <h1 className="max-w-4xl text-5xl font-extrabold leading-[1.02] tracking-tight md:text-7xl">
              {c.hero.titleLine1}
              {c.hero.titleLine2 && (
                <>
                  <br />
                  <span className="text-accent">{c.hero.titleLine2}</span>
                </>
              )}
            </h1>
            {c.hero.subtext && <p className="mt-6 max-w-xl text-lg/relaxed text-primary-foreground/90">{c.hero.subtext}</p>}
            <div className="mt-10 flex flex-wrap gap-4">
              <Button
                asChild
                size="lg"
                className="bg-accent text-accent-foreground transition-transform hover:-translate-y-0.5 hover:bg-accent/90 active:translate-y-0"
              >
                <CmsLink href={c.hero.primary.href}>
                  {c.hero.primary.label} <ArrowRight className="ml-1 size-4" />
                </CmsLink>
              </Button>
              {c.hero.secondary.label && c.hero.secondary.href && (
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10"
                >
                  <CmsLink href={c.hero.secondary.href}>{c.hero.secondary.label}</CmsLink>
                </Button>
              )}
            </div>
          </div>
          {heroImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={heroImage}
              alt={c.hero.imageAlt}
              className="aspect-square w-full rounded-2xl border-4 border-primary-foreground/20 object-cover shadow-2xl"
            />
          )}
        </div>
      </section>

      {/* HIGHLIGHTS */}
      {c.highlights.length > 0 && (
        <section id="how" className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid gap-6 md:grid-cols-3">
            {c.highlights.map(({ icon, title, body }, i) => {
              const Icon = ICONS[icon];
              return (
                <div
                  key={`${title}-${i}`}
                  className="group rounded-xl border-2 border-border bg-card p-6 transition-all hover:-translate-y-1 hover:border-primary hover:shadow-lg"
                >
                  <div className="mb-4 inline-flex rounded-lg bg-accent p-3 text-accent-foreground">
                    <Icon className="size-6" aria-hidden />
                  </div>
                  <h3 className="text-xl font-bold">{title}</h3>
                  {body && <p className="mt-2 text-muted-foreground">{body}</p>}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* FEATURED PRODUCTS */}
      {products.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 pb-16">
          <div className="mb-6 flex items-end justify-between gap-4">
            <h2 className="text-3xl font-extrabold">{c.featured.title}</h2>
            <CmsLink href="/products" className="text-sm font-semibold text-primary hover:underline">
              View all
            </CmsLink>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} imageUrl={fileUrl(p.photoKey)} />
            ))}
          </div>
        </section>
      )}

      {/* FAQ */}
      {c.faq.length > 0 && (
        <section className="mx-auto max-w-3xl px-6 pb-16">
          <h2 className="mb-4 text-3xl font-extrabold">Questions</h2>
          <div className="divide-y rounded-lg border bg-card">
            {c.faq.map((f, i) => (
              <details key={`${f.q}-${i}`} className="group px-4 py-3">
                <summary className="cursor-pointer list-none font-semibold marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {f.q}
                </summary>
                <p className="mt-2 whitespace-pre-line text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      {/* CTA band */}
      <section className="bg-secondary text-secondary-foreground">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-6 py-14 md:flex-row md:items-center md:justify-between">
          <h2 className="text-3xl font-extrabold md:text-4xl">{c.cta.title}</h2>
          <Button asChild size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90">
            <CmsLink href={c.cta.href}>
              {c.cta.label} <ArrowRight className="ml-1 size-4" />
            </CmsLink>
          </Button>
        </div>
      </section>
    </main>
  );
}
