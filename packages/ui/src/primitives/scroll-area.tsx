import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area";

import { cn } from "../cn";
import type { WithStringClassName } from "./class-name";

export type ScrollAreaProps = WithStringClassName<ScrollAreaPrimitive.Root.Props> & {
  readonly orientation?: "vertical" | "horizontal" | "both" | undefined;
};

export function ScrollArea({
  className,
  children,
  orientation = "vertical",
  ...props
}: ScrollAreaProps) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn("relative overflow-hidden", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className="size-full overscroll-contain outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ScrollAreaPrimitive.Content data-slot="scroll-area-content">
          {children}
        </ScrollAreaPrimitive.Content>
      </ScrollAreaPrimitive.Viewport>
      {orientation === "horizontal" ? null : <Scrollbar orientation="vertical" />}
      {orientation === "vertical" ? null : <Scrollbar orientation="horizontal" />}
    </ScrollAreaPrimitive.Root>
  );
}

function Scrollbar({ orientation }: { readonly orientation: "vertical" | "horizontal" }) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        "flex touch-none select-none rounded-full bg-transparent p-0.5",
        "opacity-0 transition-opacity duration-150 data-hovering:opacity-100 data-scrolling:opacity-100 motion-reduce:transition-none",
        orientation === "vertical" ? "w-2" : "h-2 flex-col",
      )}
    >
      <ScrollAreaPrimitive.Thumb
        data-slot="scroll-area-thumb"
        className="flex-1 rounded-full bg-muted-foreground/40"
      />
    </ScrollAreaPrimitive.Scrollbar>
  );
}
