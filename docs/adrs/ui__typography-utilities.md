# ADR 005: Typography Utilities

## One typeface

The product ships **Inter and nothing else**. It is loaded once in
`src/app/layout.tsx` as `--font-inter`; `--font-sans`, `--font-mono` (theme.css)
and `--sans`, `--mono` (desk-v2.css) all resolve to it. The "mono" tokens are
kept so the label rules that use them — uppercase, tracked-out eyebrows — keep
working, but they no longer switch family. Weight, size and letter-spacing carry
hierarchy; a second family does not.

Use a small set of utility classes in `src/styles/typography.css` (imported through `src/styles/globals.css`) to keep text consistent without adding wrapper components.

- Semantic class names (`text-body`, `text-muted`, `text-heading`, etc.) map to lightweight Tailwind applies
- Prefer utilities over bespoke per-component typography to stay consistent with shadcn primitives
- For button-as-input cases, match input weight (normal) so mixed controls align visually

If a new text style emerges repeatedly, add one semantic utility instead of inlining Tailwind everywhere.

## When to use raw Tailwind vs semantic utilities

**Use semantic utilities** when the pattern couples size + color + weight (e.g., `text-label` for form labels, `text-muted` for secondary body text).

**Use raw Tailwind size classes** (`text-xs`, `text-sm`, etc.) when color comes from elsewhere:

- Badge text (color from badge background styles)
- Metadata with dynamic colors (e.g., comment age indicators)

Avoid arbitrary values like `text-[11px]` — stick to Tailwind's default scale.

## Examples

Cheatsheet:

- `text-body`: default body (`text-sm`)
- `text-body-lg`: larger body (`text-base`)
- `text-muted`: secondary info (`text-sm text-muted-foreground`)
- `text-heading`: section/page headings (`text-lg font-semibold tracking-tight`)
- `text-heading-lg`: large headings (`text-xl font-semibold tracking-tight`)
- `text-heading-sm`: small section titles (`text-sm font-medium`)
- `text-label`: form field labels (`text-xs text-muted-foreground`)
- Button as input trigger:
  ```tsx
  <Button variant="outline" asInput>
    {date ? format(date, "PPP") : "Pick a date"}
  </Button>
  ```

## Avoid Opacity Modifiers on Text Colors

Do NOT use Tailwind opacity modifiers on text colors:

```tsx
// BAD - hard to read, especially on glassmorphism backgrounds
<p className="text-muted-foreground/50">Secondary text</p>

// GOOD - use the semantic utility
<p className="text-muted">Secondary text</p>
```

The `text-muted-foreground` color is already calibrated for readability in both light and dark modes. Adding `/50`, `/60`, `/70` opacity makes text unreadable on semi-transparent backgrounds.

**Exception**: Opacity modifiers are acceptable for:

- Decorative/non-essential elements (borders, icons in visual hierarchies)
- Interactive states (hover/fade effects)
- Elements that are intentionally de-emphasized and not critical to read

## Common Patterns

### Empty States

Use the shared `EmptyState` component for consistent empty state UI:

```tsx
import { EmptyState } from "@/components/empty-state";
import { Users } from "lucide-react";

<EmptyState
  icon={Users}
  title="No contributors yet"
  description="Add contributors to assign them to tasks"
/>
```

Props:

- `icon`: LucideIcon - the icon to display
- `title`: string - the main heading
- `description`: string - supporting text
- `iconSize`: "sm" | "lg" (default: "lg") - h-12 vs h-16
- `children`: React.ReactNode - optional action buttons

## Links

- Utilities defined in: `src/styles/typography.css`
- EmptyState component: `src/components/empty-state.tsx`
