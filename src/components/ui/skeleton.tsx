import { cn } from "@/lib/utils"

/** A placeholder block with a soft moving highlight (see `.skeleton` in globals.css; still when motion is reduced). */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn("skeleton rounded-md bg-foreground/[0.07]", className)}
      {...props}
    />
  )
}

export { Skeleton }
