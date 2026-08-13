# Feature: Application theme

## Overview

The Squirrl reference implementation is authoritative and light-only. The
signed-in interface is therefore forced to the reference light theme so saved
or system dark-mode preferences cannot change its colors.

## User Flows

- All signed-in routes render the `#fafbfc` canvas and white surfaces.
- The Settings navigation does not expose a theme picker because the reference
  has none.

## Notes

- `next-themes` remains as a provider dependency for compatibility with shared
  primitives, but `forcedTheme="light"` controls the rendered application.
