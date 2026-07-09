"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "./utils";
import { type TabsListSurface, surfaceClassName } from "../patterns/surface";

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}

interface TabsListProps extends React.ComponentProps<typeof TabsPrimitive.List> {
  /** L2 frosted chrome (default) or L0 solid segmented bar. */
  surface?: TabsListSurface;
}

function TabsList({
  className,
  surface = "frosted",
  ...props
}: TabsListProps) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        surfaceClassName(surface),
        "text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-xl p-[3px]",
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-[calc(var(--radius)-1px)] border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-muted-foreground transition-[color,box-shadow,background-color,border-color] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "data-[state=active]:surface-premium data-[state=active]:text-foreground",
        "hover:text-foreground/90",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
export type { TabsListProps, TabsListSurface };
