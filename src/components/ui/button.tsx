import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium tracking-[-0.01em] transition-[background-color,border-color,color,box-shadow,transform] duration-150 cursor-pointer disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-3 focus-visible:ring-ring aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "border border-transparent bg-primary text-primary-foreground shadow-[0_1px_2px_rgba(0,0,0,0.12)] hover:bg-[#0077ed] dark:hover:bg-[#409cff] active:scale-[0.98]",
        destructive:
          "border border-transparent bg-destructive text-white shadow-[0_1px_2px_rgba(0,0,0,0.12)] hover:bg-destructive/90 active:scale-[0.98] focus-visible:ring-destructive/30",
        outline:
          "border border-border bg-white/72 dark:bg-white/8 backdrop-blur-xl shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:bg-white dark:hover:bg-white/12 active:scale-[0.98]",
        secondary:
          "border border-transparent bg-secondary text-secondary-foreground hover:bg-[#dedee3] dark:hover:bg-[#3a3a3c] active:scale-[0.98]",
        ghost:
          "border border-transparent hover:bg-black/5 dark:hover:bg-white/10 active:scale-[0.98]",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2 has-[>svg]:px-3.5",
        sm: "h-9 rounded-lg gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-11 rounded-xl px-6 has-[>svg]:px-4",
        icon: "size-10",
        "icon-sm": "size-9",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  asInput = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    asInput?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), asInput && "font-normal", className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
