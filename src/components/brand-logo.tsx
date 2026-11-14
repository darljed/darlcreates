import Image from "next/image";
import { cn } from "@/lib/utils";
import { LOGO_SPECS } from "@/lib/branding-schema";
import { fileUrl } from "@/lib/storage-url";
import { getBranding, getSiteInfo } from "@/lib/site-content";

/**
 * The brand logo. Uses the owner's uploaded file (Admin → Logos & branding) when there is one, otherwise the
 * built-in files in /public/brand. Size it with a height class (e.g. className="h-9"); width follows the
 * aspect ratio. Uploaded files are plain <img> (they are served by /api/files with a long cache) with their real
 * width/height attributes so the page doesn't jump while they load.
 *
 * - "horizontal": icon + wordmark. If a dark-background version is uploaded it is swapped in with CSS
 *   (`dark:` needs the `.dark` class: nothing sets it yet, see gap G-30); otherwise the one logo is used.
 * - "icon": the symbol only.
 */
export async function BrandLogo({
  variant = "horizontal",
  className,
  priority = false,
}: {
  variant?: "horizontal" | "icon";
  className?: string;
  priority?: boolean;
}) {
  const [{ logos }, info] = await Promise.all([getBranding(), getSiteInfo()]);
  const name = info.store.name;

  const custom = (a: { key: string; width: number; height: number }, extra: string, alt: string, hidden = false) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={fileUrl(a.key) ?? ""}
      alt={alt}
      aria-hidden={hidden || undefined}
      width={a.width}
      height={a.height}
      decoding="async"
      {...(priority ? { fetchPriority: "high" as const } : {})}
      className={cn("w-auto", extra, className)}
    />
  );

  if (variant === "icon") {
    if (logos.icon) return custom(logos.icon, "", name);
    const f = LOGO_SPECS.icon.fallback;
    return <Image src={f.src} alt={name} width={f.width} height={f.height} priority={priority} className={cn("w-auto", className)} />;
  }

  const light = logos.horizontal;
  const dark = logos.horizontalDark;
  const lf = LOGO_SPECS.horizontal.fallback;
  const df = LOGO_SPECS.horizontalDark.fallback;

  // Uploaded logo(s)
  if (light || dark) {
    const main = light ?? null;
    if (main && !dark) return custom(main, "", name);
    return (
      <>
        {main ? custom(main, "dark:hidden", name) : <Image src={lf.src} alt={name} width={lf.width} height={lf.height} priority={priority} className={cn("w-auto dark:hidden", className)} />}
        {dark && custom(dark, "hidden dark:block", "", true)}
      </>
    );
  }

  // Built-in
  return (
    <>
      <Image src={lf.src} alt={name} width={lf.width} height={lf.height} priority={priority} className={cn("w-auto dark:hidden", className)} />
      <Image src={df.src} alt="" aria-hidden width={df.width} height={df.height} className={cn("hidden w-auto dark:block", className)} />
    </>
  );
}
