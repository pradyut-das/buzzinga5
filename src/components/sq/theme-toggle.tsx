"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

/**
 * Light is the default; the mock's charcoal panels are the dark variant. Kept
 * separate from the board ThemeToggle, which also reports storage usage and
 * needs a query client the desk shell does not mount.
 */
export function SqThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const dark = mounted && resolvedTheme === "dark";

  return (
    <button
      type="button"
      className="sq-pill"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {mounted ? dark ? <Moon aria-hidden /> : <Sun aria-hidden /> : <Sun aria-hidden />}
      <span>{dark ? "Dark" : "Light"}</span>
    </button>
  );
}
