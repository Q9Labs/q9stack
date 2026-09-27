"use client";

import { PanelLeftCloseIcon, PanelLeftOpenIcon, Menu01Icon } from "@hugeicons/core-free-icons";
import type { ComponentPropsWithRef, ReactNode } from "react";

import { cn } from "../cn";
import { Icon } from "../icon";
import { Button } from "../primitives/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../primitives/tooltip";
import { useAppShell } from "./app-shell-context";

export interface TopbarProps extends Omit<ComponentPropsWithRef<"header">, "title"> {
  /** Leading content, usually a page title or breadcrumb. */
  readonly title?: ReactNode;
  /** Trailing content: search, notifications, account menu. */
  readonly actions?: ReactNode;
  readonly menuLabel?: string | undefined;
  /** Accessible label for the desktop collapse toggle. */
  readonly collapseLabel?: string | undefined;
}

export function Topbar({
  className,
  title,
  actions,
  menuLabel = "Open navigation",
  collapseLabel = "Collapse navigation",
  children,
  ...props
}: TopbarProps) {
  const { setMobileNavOpen, collapsed, setCollapsed } = useAppShell();

  return (
    <header
      data-slot="topbar"
      className={cn(
        "flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-3 sm:px-4",
        className,
      )}
      {...props}
    >
      <Button
        variant="ghost"
        size="icon"
        aria-label={menuLabel}
        className="md:hidden"
        onClick={() => setMobileNavOpen(true)}
      >
        <Icon icon={Menu01Icon} size="md" />
      </Button>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label={collapseLabel}
              className="hidden text-muted-foreground md:inline-flex"
              onClick={() => setCollapsed(!collapsed)}
            >
              <Icon icon={collapsed ? PanelLeftOpenIcon : PanelLeftCloseIcon} size="md" />
            </Button>
          }
        />
        <TooltipContent side="bottom">
          {collapsed ? "Expand navigation" : collapseLabel}
        </TooltipContent>
      </Tooltip>

      {title === undefined ? null : (
        <div data-slot="topbar-title" className="truncate text-sm font-semibold text-foreground">
          {title}
        </div>
      )}
      {children}
      {actions === undefined ? null : (
        <div data-slot="topbar-actions" className="ms-auto flex items-center gap-2">
          {actions}
        </div>
      )}
    </header>
  );
}
