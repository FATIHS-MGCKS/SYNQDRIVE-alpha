"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "./utils";
import { type TabsListSurface, surfaceClassName } from "../patterns/surface";
import { CHROME_RADIX_TAB_TRIGGER_CLASS } from "../patterns/chrome-tab-bar";

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
      className={cn(CHROME_RADIX_TAB_TRIGGER_CLASS, className)}
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
