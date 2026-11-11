import Link from "next/link";
import { Clock, Mail, MapPin, Phone } from "lucide-react";
import { getSiteInfo } from "@/lib/site-content";
import { telHref } from "@/lib/site-content-schema";
import { CmsLink } from "@/components/cms";
import { BrandLogo } from "@/components/brand-logo";
import { InstallApp } from "@/components/install-app";

/** Site-wide footer. Everything except the legal links is managed in Admin → Store & footer. */
export async function SiteFooter() {
  const { store, links, social, note } = await getSiteInfo();
  const tel = telHref(store.phone);
  const linkClass = "text-muted-foreground hover:text-foreground hover:underline";

  return (
    <footer className="mt-auto border-t bg-muted/40">
      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-3 sm:col-span-2 lg:col-span-1">
          <Link href="/" aria-label={`${store.name} home`} className="inline-block">
            <BrandLogo variant="horizontal" className="h-8" />
          </Link>
          {store.tagline && <p className="text-sm font-semibold">{store.tagline}</p>}
          {store.about && <p className="text-sm text-muted-foreground">{store.about}</p>}
        </div>

        <nav aria-label="Explore" className="text-sm">
          <h2 className="mb-3 font-bold">Explore</h2>
          <ul className="space-y-2">
            {links.map((l, i) => (
              <li key={`${l.href}-${i}`}>
                <CmsLink href={l.href} className={linkClass}>
                  {l.label}
                </CmsLink>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Legal" className="text-sm">
          <h2 className="mb-3 font-bold">Legal</h2>
          <ul className="space-y-2">
            <li>
              <Link href="/privacy" className={linkClass}>
                Privacy Policy
              </Link>
            </li>
            <li>
              <Link href="/terms" className={linkClass}>
                Terms and Conditions
              </Link>
            </li>
          </ul>
        </nav>

        <div className="text-sm">
          <h2 className="mb-3 font-bold">Contact</h2>
          <ul className="space-y-2 text-muted-foreground">
            {store.email && (
              <li className="flex items-start gap-2">
                <Mail className="mt-0.5 size-4 shrink-0" aria-hidden />
                <a href={`mailto:${store.email}`} className="min-w-0 break-words hover:text-foreground hover:underline">
                  {store.email}
                </a>
              </li>
            )}
            {store.phone && (
              <li className="flex items-start gap-2">
                <Phone className="mt-0.5 size-4 shrink-0" aria-hidden />
                {tel ? (
                  <a href={tel} className="hover:text-foreground hover:underline">
                    {store.phone}
                  </a>
                ) : (
                  <span>{store.phone}</span>
                )}
              </li>
            )}
            {store.address && (
              <li className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span className="min-w-0 break-words">{store.address}</span>
              </li>
            )}
            {store.hours && (
              <li className="flex items-start gap-2">
                <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span className="min-w-0 break-words">{store.hours}</span>
              </li>
            )}
          </ul>
          {social.length > 0 && (
            <ul aria-label="Social media" className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
              {social.map((l, i) => (
                <li key={`${l.href}-${i}`}>
                  <CmsLink href={l.href} className="font-medium text-primary hover:underline">
                    {l.label}
                  </CmsLink>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-4">
          <p className="text-xs text-muted-foreground">
            © {store.name}
            {note && <> · {note}</>}
          </p>
          <InstallApp />
        </div>
      </div>
    </footer>
  );
}
