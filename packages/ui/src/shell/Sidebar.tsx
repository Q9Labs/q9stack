import type { ComponentPropsWithRef } from "react";

import { cn } from "../cn";
import { Icon, type IconSvgElement } from "../icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "../primitives/tooltip";
import { useSidebarCollapsed } from "./app-shell-context";

export function Sidebar({ className, ...props }: ComponentPropsWithRef<"div">) {
  return (
    <div
      data-slot="sidebar"
      className={cn("flex h-full flex-col gap-2 bg-sidebar p-3 text-sidebar-foreground", className)}
      {...props}
    />
  );
}

export function SidebarHeader({ className, ...props }: ComponentPropsWithRef<"div">) {
  return (
    <div
      data-slot="sidebar-header"
      className={cn("flex h-9 items-center gap-2 rounded-md px-2", className)}
      {...props}
    />
  );
}

export function SidebarNav({ className, ...props }: ComponentPropsWithRef<"nav">) {
  return (
    <nav
      data-slot="sidebar-nav"
      className={cn("flex flex-1 flex-col gap-1 overflow-y-auto overscroll-contain", className)}
      {...props}
    />
  );
}

export function SidebarGroupLabel({ className, ...props }: ComponentPropsWithRef<"p">) {
  const collapsed = useSidebarCollapsed();
  return (
    <p
      data-slot="sidebar-group-label"
      data-collapsed={collapsed ? "" : undefined}
      className={cn(
        "px-3 pt-5 pb-2 text-xs font-semibold tracking-wide uppercase text-sidebar-foreground/55",
        collapsed && "sr-only",
        className,
      )}
      {...props}
    />
  );
}

export interface SidebarNavItemProps extends ComponentPropsWithRef<"a"> {
  readonly icon?: IconSvgElement | undefined;
  readonly active?: boolean | undefined;
  /** Label shown in the collapsed-rail tooltip. Falls back to string children. */
  readonly label?: string | undefined;
}

export function SidebarNavItem({
  className,
  icon,
  active = false,
  label,
  children,
  ...props
}: SidebarNavItemProps) {
  const collapsed = useSidebarCollapsed();

  const item = (
    <a
      data-slot="sidebar-nav-item"
      data-active={active ? "" : undefined}
      data-collapsed={collapsed ? "" : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium",
        "transition-colors duration-150 motion-reduce:transition-none",
        "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring",
        collapsed && "justify-center gap-0 px-0",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        className,
      )}
      {...props}
    >
      {active && !collapsed ? (
        <span
          data-slot="sidebar-nav-item-indicator"
          aria-hidden
          className="absolute start-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-e-full bg-primary"
        />
      ) : null}
      {icon ? <Icon icon={icon} size="sm" className="size-4.5 shrink-0" /> : null}
      <span className={cn("truncate", collapsed && "hidden")}>{children}</span>
    </a>
  );

  if (!collapsed) {
    return item;
  }

  const tooltipLabel = label ?? (typeof children === "string" ? children : undefined);
  if (tooltipLabel === undefined) {
    return item;
  }

  return (
    <Tooltip>
      <TooltipTrigger render={item} />
      <TooltipContent side="top" sideOffset={8}>
        {tooltipLabel}
      </TooltipContent>
    </Tooltip>
  );
}

export function SidebarFooter({ className, ...props }: ComponentPropsWithRef<"div">) {
  const collapsed = useSidebarCollapsed();
  return (
    <div
      data-slot="sidebar-footer"
      data-collapsed={collapsed ? "" : undefined}
      className={cn(
        "mt-auto flex items-center gap-2 border-t border-sidebar-border p-2",
        collapsed && "justify-center",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarFooterLabel({ className, ...props }: ComponentPropsWithRef<"div">) {
  const collapsed = useSidebarCollapsed();
  return (
    <div
      data-slot="sidebar-footer-label"
      data-collapsed={collapsed ? "" : undefined}
      className={cn("flex min-w-0 flex-1 flex-col", collapsed && "hidden", className)}
      {...props}
    />
  );
}

export function SidebarFooterText({
  className,
  children,
  ...props
}: ComponentPropsWithRef<"span">) {
  return (
    <span
      data-slot="sidebar-footer-text"
      className={cn("truncate text-sm font-medium", className)}
      {...props}
    >
      {children}
    </span>
  );
}

export function SidebarFooterDescription({
  className,
  children,
  ...props
}: ComponentPropsWithRef<"span">) {
  return (
    <span
      data-slot="sidebar-footer-description"
      className={cn("truncate text-xs text-sidebar-foreground/55", className)}
      {...props}
    >
      {children}
    </span>
  );
}
