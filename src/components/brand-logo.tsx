import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Darl Creates logo. Size it with a height class (e.g. className="h-9");
 * width follows the aspect ratio. Files are built by
 * scripts/build-brand-assets.py from brand/source/.
 *
 * - "horizontal": icon + wordmark. Two files: black wordmark (light theme) and
 *   white wordmark (dark theme), swapped with CSS (`dark:` needs the `.dark`
 *   class — see gap G-30, nothing sets it yet so light always shows).
 * - "icon": icon only. Black with white fills + outline, so it reads on any
 *   background; no swap needed.
 */
const ASSETS = {
  horizontalLight: { src: "/brand/logo-horizontal.png", w: 1000, h: 234 },
  horizontalDark: { src: "/brand/logo-horizontal-dark.png", w: 1000, h: 234 },
  icon: { src: "/brand/logo-icon.png", w: 512, h: 633 },
} as const;

export function BrandLogo({
  variant = "horizontal",
  className,
  priority = false,
}: {
  variant?: "horizontal" | "icon";
  className?: string;
  priority?: boolean;
}) {
  if (variant === "icon") {
    const a = ASSETS.icon;
    return (
      <Image
        src={a.src}
        alt="Darl Creates"
        width={a.w}
        height={a.h}
        priority={priority}
        className={cn("w-auto", className)}
      />
    );
  }

  const light = ASSETS.horizontalLight;
  const dark = ASSETS.horizontalDark;
  return (
    <>
      <Image
        src={light.src}
        alt="Darl Creates"
        width={light.w}
        height={light.h}
        priority={priority}
        className={cn("w-auto dark:hidden", className)}
      />
      <Image
        src={dark.src}
        alt=""
        aria-hidden
        width={dark.w}
        height={dark.h}
        className={cn("hidden w-auto dark:block", className)}
      />
    </>
  );
}
