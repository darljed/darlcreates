import { getHomeContent } from "@/lib/site-content";
import { CmsLink } from "@/components/cms";

/** Site-wide footer; text and links are managed in Admin → Landing page. */
export async function SiteFooter() {
  const { footer } = await getHomeContent();
  return (
    <footer className="border-t border-border py-8">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 text-sm text-muted-foreground">
        <p>
          © Darl Creates{footer.text && <> · {footer.text}</>}
        </p>
        {footer.links.length > 0 && (
          <nav aria-label="Footer" className="flex flex-wrap gap-x-4 gap-y-1">
            {footer.links.map((l, i) => (
              <CmsLink key={`${l.href}-${i}`} href={l.href} className="hover:text-foreground hover:underline">
                {l.label}
              </CmsLink>
            ))}
          </nav>
        )}
      </div>
    </footer>
  );
}
