import { ServicesSection } from "@/components/services-section";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Design your own",
  description: "Our design tools: make a name keychain or a custom clicker, see it in 3D, and we print it to order.",
  path: "/services",
});

/** The hub for the design tools (generators). Each one is a standalone service with its own page. */
export default function ServicesPage() {
  return (
    <main className="flex-1">
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <h1 className="text-4xl font-extrabold md:text-5xl">Design your own</h1>
          <p className="mt-3 max-w-xl text-primary-foreground/90">Pick a tool, make it yours in 3D, and we print it to order.</p>
        </div>
      </section>
      <ServicesSection heading={false} />
    </main>
  );
}
