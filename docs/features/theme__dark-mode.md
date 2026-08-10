# Feature: Dark Mode

## Overview

The application supports light, dark, and system-based themes. Users can toggle between themes via a dropdown menu in the board header.

## User Flows

### Toggle Theme

- Click the sun/moon icon in the top-right corner of the board header
- Select from dropdown options:
  - **Light**: Forces light theme
  - **Dark**: Forces dark theme
  - **System**: Follows OS/browser preference
- Theme preference is saved to localStorage and persists across sessions

### System Theme

- When set to "System", the app respects the user's OS preference
- Automatically updates if the OS theme changes (e.g., scheduled dark mode)

## Technical Notes

- Powered by `next-themes` library
- Theme is applied via `.dark` class on the `<html>` element
- CSS variables in `src/styles/theme.css` (loaded via `src/styles/globals.css`) define all color values for both themes
- `suppressHydrationWarning` on `<html>` prevents SSR hydration warnings
- All shadcn/ui components automatically adapt to the current theme

## Visual Design

### Light Theme

- Neutral `#f5f5f7` application canvas with white layered surfaces
- Near-black `#1d1d1f` text for readability
- System blue (`#0071e3`) for primary actions and focus
- Glass backgrounds: approximately 60–80% white with high saturation blur
- Borders need higher opacity to be visible (avoid `border-border/30` or lower)

### Dark Theme

- Black application canvas with elevated graphite surfaces
- Off-white text for contrast
- Brighter system blue (`#2997ff`) for primary actions and focus
- Adjusted accent colors for visibility
- Glass backgrounds: graphite at approximately 68–82% opacity
- Borders are more visible due to white-on-dark contrast

### Glassmorphism Considerations

The app uses glassmorphism styling (see `docs/features/theme__glassmorphism.md`). When adding new components, ensure they work well in both themes:

- **Backgrounds**: Always specify both light and dark variants (`bg-white/40 dark:bg-white/5`)
- **Borders**: Use `border-border/50` minimum for visibility in light mode; `border-border/30` becomes invisible
- **Shadows**: Light mode uses subtle shadows; dark mode uses darker, more prominent shadows
- **Backdrop blur**: Keep it restrained against the solid application canvas
