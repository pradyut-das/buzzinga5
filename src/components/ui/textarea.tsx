import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[96px] w-full rounded-xl border border-border bg-white/80 px-3.5 py-3 text-base shadow-[0_1px_2px_rgba(0,0,0,0.05)] backdrop-blur-xl transition-[background-color,border-color,box-shadow] placeholder:text-muted-foreground hover:bg-white focus-visible:border-primary/55 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white/8 dark:hover:bg-white/12 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
