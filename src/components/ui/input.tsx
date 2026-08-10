import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type = "text", ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground h-10 w-full min-w-0 rounded-xl border border-border bg-white/80 dark:bg-white/8 backdrop-blur-xl px-3.5 py-2 text-sm shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-[background-color,border-color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "hover:bg-white dark:hover:bg-white/12",
        "focus-visible:border-primary/55 focus-visible:ring-3 focus-visible:ring-ring focus-visible:bg-white dark:focus-visible:bg-white/12",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
