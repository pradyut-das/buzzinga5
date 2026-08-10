# Feature: Glassmorphism

## Overview

We use a restrained Apple-inspired material system to keep the UI cohesive across pages and themes.
Primary workspaces are flat, edge-to-edge canvases; translucency, continuous radii, and shadows are
reserved for controls, popovers, dialogs, and temporary overlays. The product keeps its own Squirrl
identity; the reference is interaction quality, not copied Apple branding or product chrome.

## Design Principles

- Favor readability and contrast over effect; increase border/opacity when clarity suffers
- Keep blur and translucency subtle; avoid heavy frosted looks
- Reuse shared glass utilities/vars; adjust opacity/blur per context (card, dialog, control)
- Use solid application canvases; gradients are not part of the visual language
- Use system blue only for actions, selection, focus, and active navigation
- Prefer sentence case, calm type hierarchy, and continuous 12–28px radii over dense uppercase UI
- Use layered shadows sparingly: a fine inner highlight, a short contact shadow, and soft ambient depth
- Do not wrap full pages, navigation rails, kanban columns, or list rows in floating cards
- Prefer whitespace and one-pixel dividers for persistent information architecture
- Let the shared depth canvas show through only at low contrast; content remains visually dominant

## Implementation Notes

- Use the shared glass utility classes in `src/styles/glassmorphism.css` (imported via `src/styles/globals.css`) for surfaces and controls
- `GlobalDepthCanvas` is mounted once in the root layout. It draws a sparse perspective floor and
  depth particles with the 2D Canvas API, caps device pixel ratio at 1.5, ignores pointer input,
  and pauses continuous motion when reduced motion is requested.
- Use `app-canvas` as a transparent route container over the solid light/dark body background
- Cards, dialogs, and controls should feel related but can vary slightly by context
- Test in light/dark themes to ensure borders and text remain legible
- Do not add per-card WebGL scenes. Three.js is reserved for the home intelligence core; other
  routes use the shared low-cost canvas and CSS perspective/shadows.

## Links

- Utilities: `src/styles/glassmorphism.css`
- Variables: `src/styles/theme.css`
- Shared canvas: `src/components/canvas/global-depth-canvas.tsx`
