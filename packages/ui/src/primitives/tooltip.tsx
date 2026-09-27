import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";

import { cn } from "../cn";
import type { WithStringClassName } from "./class-name";

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export type TooltipContentProps = WithStringClassName<TooltipPrimitive.Popup.Props> & {
  readonly side?: TooltipPrimitive.Positioner.Props["side"] | undefined;
  readonly sideOffset?: number | undefined;
};

export function TooltipContent({
  className,
  side = "top",
  sideOffset = 6,
  ...props
}: TooltipContentProps) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        data-slot="tooltip-positioner"
        className="z-50 outline-none"
        side={side}
        sideOffset={sideOffset}
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "max-w-64 rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background shadow-md",
            "origin-(--transform-origin) transition-[opacity,transform] duration-100 ease-out motion-reduce:transition-none",
            "data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
            "data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
            className,
          )}
          {...props}
        />
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}
