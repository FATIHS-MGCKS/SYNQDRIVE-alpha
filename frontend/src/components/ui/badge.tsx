import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90 dark:bg-accent dark:text-foreground dark:[a&]:hover:bg-accent/90",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-status-critical-soft dark:text-status-critical dark:border-status-critical/20 dark:[a&]:hover:bg-status-critical-soft/90",
        outline:
          "text-foreground border-border/70 [a&]:hover:bg-accent [a&]:hover:text-accent-foreground dark:[a&]:hover:bg-muted",
        success:
          "border-transparent bg-status-positive-soft text-status-positive [a&]:hover:opacity-90",
        watch:
          "border-transparent bg-status-attention-soft text-status-attention [a&]:hover:opacity-90",
        warning:
          "border-transparent bg-status-warning-soft text-status-warning [a&]:hover:opacity-90",
        critical:
          "border-transparent bg-status-critical-soft text-status-critical [a&]:hover:opacity-90",
        info:
          "border-transparent bg-status-info-soft text-status-info [a&]:hover:opacity-90",
        noData:
          "border-transparent bg-status-nodata-soft text-status-nodata [a&]:hover:opacity-90",
        ai:
          "border-transparent bg-status-ai-soft text-status-ai [a&]:hover:opacity-90",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
