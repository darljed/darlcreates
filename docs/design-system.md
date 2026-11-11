# Design system

> Last updated: 2026-11-11. Source: `src/app/globals.css`, `src/components/shell/*`, `src/components/admin/editor-bits.tsx`.

Rules for building UI that matches the rest of the app. Check any new screen against this page.

## Tokens (`src/app/globals.css`)

Tailwind v4 reads tokens from CSS (no `tailwind.config`). Colours are `oklch`.

| Token | Value | Use |
|---|---|---|
| `--primary` | `oklch(0.52 0.14 225)` | Brand cyan-blue. Buttons, links, focus ring. White text on it is 5.0:1 (AA) |
| `--secondary` | `oklch(0.86 0.13 200)` | Cyan highlight (paid / in-production badges) |
| `--accent` | `oklch(0.9 0.19 110)` | Lime highlight. Large or bold text only on primary (3.8:1) |
| `--background` / `--foreground` | warm paper / near-black ink | Page and body text |
| `--muted(-foreground)` | light grey / `oklch(0.47 …)` | Secondary text, disabled states |
| `--destructive` | `oklch(0.58 0.24 27)` | Delete, reject, errors |
| `--sidebar` | `oklch(0.945 0.018 232)` | Tinted shell sidebar |
| `--radius` | `0.9rem` (`0.375rem` when compact) | Corner radius; `sm/md/lg/xl` derive from it |
| `--chart-1…5` | primary, cyan, lime, violet, green | Revenue chart and any future charts |

- Fonts: **Plus Jakarta Sans** (`--font-sans`) and **JetBrains Mono** (`--font-mono`), loaded in `src/app/layout.tsx`. Headings use weight 800.
- `color-scheme: light` is set on `:root`. There is no dark theme (gap G-30); the property stops dark-mode browsers recolouring native controls and default error pages.
- Every colour pair is chosen for WCAG AA. Do not put body copy on `--accent`.

## Density

`InsetShell` sets `data-density` on its root.

| Surface | Density | Effect |
|---|---|---|
| `/admin` | `compact` | Square-ish corners (0.375rem), shorter inputs and buttons, 13px form text, 11px badges |
| Customer area (`(portal)`) | `comfortable` | Default sizes and radius |

Rules live in `globals.css` under `[data-density="compact"]` and target `data-slot` attributes of the shadcn parts. Do not hard-code sizes in admin pages to get the compact look.

## Shell and page primitives

| Component | File | Notes |
|---|---|---|
| `InsetShell` | `shell/inset-shell.tsx` | Tinted collapsible sidebar, content in a raised rounded panel, breadcrumb, mobile sheet nav. Props: `density`, `brand`, `groups`, `sidebarFooter`, `topbarRight`, `rootLabel`, `rootless`, `labels`. `rootless` is the customer area (no URL segment of its own). Breadcrumb turns ids into "Details" |
| `PageHeader` | `shell/ui.tsx` | Title, optional description and actions. One per page |
| `Panel` | `shell/ui.tsx` | Bordered card section with optional title and actions |
| `DataTable`, `Th`, `Tr`, `Td` | `shell/ui.tsx` | Square tables. `Td label="…"` supplies the label shown when the table stacks on phones |
| `Stat` | `shell/ui.tsx` | KPI card. Sizes itself with a container query so numbers never clip |
| `EmptyState` | `shell/ui.tsx` | "Nothing here yet" block with an optional action |

### Tables on phones

Under 640px `.stack-table` turns each row into a card of `LABEL  value` lines (CSS in `globals.css`). The header row stays for screen readers only. Every `Td` in a data column needs `label`, or the cell shows no caption. Action cells (Verify, Reject) stay on screen instead of scrolling sideways.

## Forms (`admin/editor-bits.tsx`)

| Component | Purpose |
|---|---|
| `Field` | Label + control + optional hint. The hint is a single truncated line on the label row (full text in the tooltip), so it never adds a row and never moves the input. The control must be one element: `Field` gives it the `id` and `aria-describedby` |
| `Check` | Labelled checkbox |
| `RowTools` | Move up / down / remove buttons for list rows, with an `aria-label` that names the row (`what`) |
| `swap` | Pure helper to reorder an array |

`ConfirmDialog` (`admin/confirm-dialog.tsx`) replaces `window.confirm` for destructive admin actions.

## Badges

- `OrderStatusBadge` (`order-status-badge.tsx`): one label and one colour per order status. Add a new status to both `LABELS` and `STYLES`.
- `UserStatusBadge`, `RoleBadge`, `Initials` (`admin/user-badges.tsx`): user state (active, blocked, deleted), role and the avatar fallback.

## Loading, empty and error states

| State | Component |
|---|---|
| 3D model loading | `ViewerLoading` (`three/viewer-loading.tsx`): spinning cube; after 6 s (CSS only) a "Still working" line fades in. Honors reduced motion |
| Suspense fallback | `ui/skeleton.tsx` |
| Empty list | `EmptyState` |
| Missing page | `NotFoundView` (`not-found-view.tsx`), used by `app/not-found.tsx` and the `(shop)`, `(portal)` and `(admin)/admin` not-found files so each surface keeps its own chrome |
| Toasts | `ui/sonner.tsx` |

## Accessibility

- Every form control has a label or `aria-label`. `npx tsx scripts/test-a11y-labels.ts` enforces it.
- Icon-only buttons need `aria-label`.
- Animations stop under `prefers-reduced-motion` (global rule plus the viewer's own).
- Focus ring is `--ring` (= primary).

## Print

Add `.no-print` (CSS class) or Tailwind `print:hidden` to anything that must not appear on paper (buttons, nav). `PrintButton` uses `print:hidden`; the Order Acknowledgment page relies on both.

## shadcn

Primitives live in `src/components/ui` (new-york style, Radix). After `shadcn add`, rewrite `import { cn } from "cn"` to `@/lib/utils`; never install the `cn` package.

## Responsive check

Before merging a UI change, load it at **375px** and **320px** wide. Look for horizontal scroll, clipped numbers, and buttons pushed off screen. Tables must stack; product page and checkout must fit at 320px.
