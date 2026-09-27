import { Popover as PopoverPrimitive } from "@base-ui/react/popover";

import { cn } from "../cn";
import type { WithStringClassName } from "./class-name";
import { popupMotionClassName, popupSurfaceClassName } from "./popup";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverClose = PopoverPrimitive.Close;

export type PopoverContentProps = WithStringClassName<PopoverPrimitive.Popup.Props> & {
  readonly side?: PopoverPrimitive.Positioner.Props["side"] | undefined;
  readonly align?: PopoverPrimitive.Positioner.Props["align"] | undefined;
  readonly sideOffset?: number | undefined;
};

export function PopoverContent({
  className,
  side = "bottom",
  align = "center",
  sideOffset = 8,
  ...props
}: PopoverContentProps) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        data-slot="popover-positioner"
        className="z-50 outline-none"
        side={side}
        align={align}
        sideOffset={sideOffset}
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(popupSurfaceClassName, popupMotionClassName, "w-72 p-4", className)}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

export type PopoverTitleProps = WithStringClassName<PopoverPrimitive.Title.Props>;

export function PopoverTitle({ className, ...props }: PopoverTitleProps) {
  return (
    <PopoverPrimitive.Title
      data-slot="popover-title"
      className={cn("text-sm font-semibold text-foreground", className)}
      {...props}
    />
  );
}

export type PopoverDescriptionProps = WithStringClassName<PopoverPrimitive.Description.Props>;

export function PopoverDescription({ className, ...props }: PopoverDescriptionProps) {
  return (
    <PopoverPrimitive.Description
      data-slot="popover-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}
