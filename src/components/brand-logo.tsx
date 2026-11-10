import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Darl Creates logo. Source art is black on transparent, so `dark:invert`
 * turns it white on dark backgrounds. Size it with a height class
 * (e.g. className="h-9"); width follows the aspect ratio.
 * Files are built by scripts/build-brand-assets.py from brand/source/.
 */
const VARIANTS = {
  horizontal: { src: "/brand/logo-horizontal.png", w: 900, h: 361 },
  tagline: { src: "/brand/logo-horizontal-tagline.png", w: 1000, h: 397 },
  icon: { src: "/brand/logo-icon.png", w: 512, h: 629 },
  stacked: { src: "/brand/logo-stacked.png", w: 900, h: 785 },
} as const;

export function BrandLogo({
  variant = "horizontal",
  className,
  priority = false,
}: {
  variant?: keyof typeof VARIANTS;
  className?: string;
  priority?: boolean;
}) {
  const v = VARIANTS[variant];
  return (
    <Image
      src={v.src}
      alt="Darl Creates"
      width={v.w}
      height={v.h}
      priority={priority}
      className={cn("w-auto dark:invert", className)}
    />
  );
}
