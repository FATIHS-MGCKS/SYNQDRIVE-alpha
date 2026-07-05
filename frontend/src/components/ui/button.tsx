import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap text-[13px] font-semibold leading-none outline-none disabled:pointer-events-none disabled:opacity-55 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      variant: {
        default: "sq-3d-btn sq-3d-btn--primary",
        primary: "sq-3d-btn sq-3d-btn--primary",
        destructive:
          "sq-3d-btn sq-3d-btn--destructive",
        warning:
          "sq-3d-btn sq-3d-btn--warning",
        success:
          "sq-3d-btn sq-3d-btn--success",
        outline:
          "sq-3d-btn sq-3d-btn--neutral",
        neutral:
          "sq-3d-btn sq-3d-btn--neutral",
        secondary:
          "sq-3d-btn sq-3d-btn--secondary",
        ai:
          "sq-3d-btn sq-3d-btn--ai",
        ghost:
          "rounded-[10px] text-muted-foreground transition-[background-color,color,box-shadow,transform] duration-200 ease-out hover:bg-muted/80 hover:text-foreground active:translate-y-px focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        link: "text-[color:var(--brand)] underline-offset-4 transition-colors hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring",
      },
      size: {
        default: "min-h-9 px-3.5 py-2 has-[>svg]:px-3",
        sm: "min-h-8 px-3 py-1.5 text-xs has-[>svg]:px-2.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "min-h-10 px-5 py-2.5 text-sm has-[>svg]:px-4",
        icon: "size-9 p-0 [&_svg:not([class*='size-'])]:size-4",
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
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
