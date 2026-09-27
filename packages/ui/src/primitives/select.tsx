import { Select as SelectPrimitive } from "@base-ui/react/select";
import { ArrowDown01Icon, Tick02Icon } from "@hugeicons/core-free-icons";

import { cn } from "../cn";
import { Icon } from "../icon";
import type { WithStringClassName } from "./class-name";
import { popupMotionClassName, popupSurfaceClassName } from "./popup";

export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;
export const SelectGroup = SelectPrimitive.Group;

export type SelectTriggerProps = WithStringClassName<SelectPrimitive.Trigger.Props>;

export function SelectTrigger({ className, children, ...props }: SelectTriggerProps) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs",
        "text-start whitespace-nowrap select-none",
        "transition-[color,box-shadow,border-color] duration-150 motion-reduce:transition-none",
        "outline-none focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring",
        "data-disabled:cursor-not-allowed data-disabled:opacity-50",
        "data-popup-open:border-ring aria-invalid:border-destructive",
        "[&_[data-slot=select-value][data-placeholder]]:text-muted-foreground",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon
        data-slot="select-icon"
        className="text-muted-foreground transition-transform duration-150 data-popup-open:rotate-180 motion-reduce:transition-none"
      >
        <Icon icon={ArrowDown01Icon} size="sm" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export type SelectContentProps = WithStringClassName<SelectPrimitive.Popup.Props> & {
  readonly sideOffset?: number | undefined;
};

export function SelectContent({
  className,
  sideOffset = 6,
  children,
  ...props
}: SelectContentProps) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        data-slot="select-positioner"
        className="z-50 outline-none"
        sideOffset={sideOffset}
        alignItemWithTrigger={false}
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            popupSurfaceClassName,
            popupMotionClassName,
            "min-w-(--anchor-width) max-h-(--available-height) p-1",
            className,
          )}
          {...props}
        >
          <SelectPrimitive.List className="overflow-y-auto">{children}</SelectPrimitive.List>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

export type SelectItemProps = WithStringClassName<SelectPrimitive.Item.Props>;

export function SelectItem({ className, children, ...props }: SelectItemProps) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "grid cursor-default grid-cols-[1rem_1fr] items-center gap-2 rounded-md py-1.5 pe-3 ps-2 text-sm outline-none select-none",
        "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
        "data-disabled:pointer-events-none data-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemIndicator className="col-start-1 flex">
        <Icon icon={Tick02Icon} size="sm" className="size-4" />
      </SelectPrimitive.ItemIndicator>
      <SelectPrimitive.ItemText className="col-start-2">{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

export type SelectGroupLabelProps = WithStringClassName<SelectPrimitive.GroupLabel.Props>;

export function SelectGroupLabel({ className, ...props }: SelectGroupLabelProps) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-group-label"
      className={cn("px-2 py-1.5 text-xs font-medium text-muted-foreground", className)}
      {...props}
    />
  );
}

export type SelectSeparatorProps = WithStringClassName<SelectPrimitive.Separator.Props>;

export function SelectSeparator({ className, ...props }: SelectSeparatorProps) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}
