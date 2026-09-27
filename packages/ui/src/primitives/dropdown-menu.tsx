import { Menu } from "@base-ui/react/menu";
import { ArrowRight01Icon, Tick02Icon } from "@hugeicons/core-free-icons";

import { cn } from "../cn";
import { Icon } from "../icon";
import type { WithStringClassName } from "./class-name";
import { menuItemClassName, popupMotionClassName, popupSurfaceClassName } from "./popup";

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuGroup = Menu.Group;
export const DropdownMenuRadioGroup = Menu.RadioGroup;
export const DropdownMenuSub = Menu.SubmenuRoot;

export type DropdownMenuContentProps = WithStringClassName<Menu.Popup.Props> & {
  readonly side?: Menu.Positioner.Props["side"] | undefined;
  readonly align?: Menu.Positioner.Props["align"] | undefined;
  readonly sideOffset?: number | undefined;
};

export function DropdownMenuContent({
  className,
  side = "bottom",
  align = "start",
  sideOffset = 6,
  ...props
}: DropdownMenuContentProps) {
  return (
    <Menu.Portal>
      <Menu.Positioner
        data-slot="dropdown-menu-positioner"
        className="z-50 outline-none"
        side={side}
        align={align}
        sideOffset={sideOffset}
      >
        <Menu.Popup
          data-slot="dropdown-menu-content"
          className={cn(popupSurfaceClassName, popupMotionClassName, "min-w-40 p-1", className)}
          {...props}
        />
      </Menu.Positioner>
    </Menu.Portal>
  );
}

export type DropdownMenuItemProps = WithStringClassName<Menu.Item.Props> & {
  readonly destructive?: boolean | undefined;
};

export function DropdownMenuItem({
  className,
  destructive = false,
  ...props
}: DropdownMenuItemProps) {
  return (
    <Menu.Item
      data-slot="dropdown-menu-item"
      className={cn(
        menuItemClassName,
        destructive &&
          "text-destructive data-highlighted:bg-destructive data-highlighted:text-destructive-foreground",
        className,
      )}
      {...props}
    />
  );
}

export type DropdownMenuCheckboxItemProps = WithStringClassName<Menu.CheckboxItem.Props>;

export function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: DropdownMenuCheckboxItemProps) {
  return (
    <Menu.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      className={cn(menuItemClassName, "ps-2 pe-3", className)}
      {...props}
    >
      <span className="flex size-4 items-center justify-center">
        <Menu.CheckboxItemIndicator>
          <Icon icon={Tick02Icon} size="sm" className="size-4" />
        </Menu.CheckboxItemIndicator>
      </span>
      {children}
    </Menu.CheckboxItem>
  );
}

export type DropdownMenuRadioItemProps = WithStringClassName<Menu.RadioItem.Props>;

export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: DropdownMenuRadioItemProps) {
  return (
    <Menu.RadioItem
      data-slot="dropdown-menu-radio-item"
      className={cn(menuItemClassName, "ps-2 pe-3", className)}
      {...props}
    >
      <span className="flex size-4 items-center justify-center">
        <Menu.RadioItemIndicator>
          <span className="size-2 rounded-full bg-foreground" />
        </Menu.RadioItemIndicator>
      </span>
      {children}
    </Menu.RadioItem>
  );
}

export type DropdownMenuLabelProps = WithStringClassName<Menu.GroupLabel.Props>;

/** Names the surrounding `<DropdownMenuGroup>`; it must have one. */
export function DropdownMenuLabel({ className, ...props }: DropdownMenuLabelProps) {
  return (
    <Menu.GroupLabel
      data-slot="dropdown-menu-label"
      className={cn("px-2 py-1.5 text-xs font-medium text-muted-foreground", className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: WithStringClassName<Menu.Separator.Props>) {
  return (
    <Menu.Separator
      data-slot="dropdown-menu-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}

export type DropdownMenuSubTriggerProps = WithStringClassName<Menu.SubmenuTrigger.Props>;

export function DropdownMenuSubTrigger({
  className,
  children,
  ...props
}: DropdownMenuSubTriggerProps) {
  return (
    <Menu.SubmenuTrigger
      data-slot="dropdown-menu-sub-trigger"
      className={cn(menuItemClassName, "justify-between", className)}
      {...props}
    >
      {children}
      <Icon icon={ArrowRight01Icon} size="sm" flipInRtl className="text-muted-foreground" />
    </Menu.SubmenuTrigger>
  );
}
