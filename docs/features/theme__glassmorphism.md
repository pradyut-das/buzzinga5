# Feature: Squirrl surface system

## Overview

The signed-in UI no longer uses Buzzinga's glassmorphism or depth-canvas
presentation. It follows the authoritative Squirrl reference: a solid
`#fafbfc` canvas, white surfaces, `#e9edf3` borders, restrained shadows, and
`#2168f5` for primary actions.

## Design Rules

- Do not render the global depth canvas in the application shell.
- Do not apply glass cards, frosted navigation, gradients, or backdrop-heavy
  panels to persistent application UI.
- Desktop navigation is a fixed 240px white sidebar.
- Cards and dialogs use the reference 14–18px radii and soft/modal shadows.
- The utility header may use the reference's subtle canvas translucency and
  light backdrop blur while sticky; this is not a glass panel treatment.

## Notes

- Older glass utility classes remain only for legacy components that have not
  yet been removed from the repository; the transplanted shell does not render
  them.
