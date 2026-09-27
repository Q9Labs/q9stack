import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";

import { cn } from "../cn";
import type { WithStringClassName } from "./class-name";

export type TabsProps = WithStringClassName<TabsPrimitive.Root.Props>;

export function Tabs({ className, ...props }: TabsProps) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-4", className)}
      {...props}
    />
  );
}

export type TabsListProps = WithStringClassName<TabsPrimitive.List.Props>;

export function TabsList({ className, children, ...props }: TabsListProps) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "relative inline-flex w-fit items-center gap-1 rounded-lg bg-muted p-1 text-muted-foreground",
        className,
      )}
      {...props}
    >
      {children}
      <TabsPrimitive.Indicator
        data-slot="tabs-indicator"
        className={cn(
          "absolute top-1/2 start-0 z-0 h-[calc(100%-0.5rem)] w-(--active-tab-width) -translate-y-1/2",
          "translate-x-(--active-tab-left) rtl:-translate-x-(--active-tab-right) rounded-md bg-background shadow-xs",
          "transition-[translate,width] duration-200 ease-out motion-reduce:transition-none",
        )}
        renderBeforeHydration
      />
    </TabsPrimitive.List>
  );
}

export type TabsTabProps = WithStringClassName<TabsPrimitive.Tab.Props>;

export function TabsTab({ className, ...props }: TabsTabProps) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-tab"
      className={cn(
        "relative z-1 inline-flex h-8 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium whitespace-nowrap select-none",
        "transition-colors duration-150 motion-reduce:transition-none",
        "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        "data-selected:text-foreground",
        "data-disabled:pointer-events-none data-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export type TabsPanelProps = WithStringClassName<TabsPrimitive.Panel.Props>;

export function TabsPanel({ className, ...props }: TabsPanelProps) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-panel"
      className={cn(
        "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
      {...props}
    />
  );
}
