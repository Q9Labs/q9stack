"use client";

import { type ReactNode, useMemo, useState } from "react";

import { cn } from "../cn";
import { AppShellContext } from "./app-shell-context";
import { MobileDrawer } from "./MobileDrawer";

export interface AppShellProps {
  /** Persistent navigation. Rendered inline from `md` up and inside the drawer below it. */
  readonly sidebar: ReactNode;
  readonly topbar?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string | undefined;
  readonly navigationLabel?: string | undefined;
  /** Whether the desktop sidebar starts collapsed to an icon-only rail. */
  readonly defaultCollapsed?: boolean | undefined;
}

/**
 * Two-column application frame: a sidebar on the inline start and a scrolling
 * content column. The sidebar is a 16rem column from `md` up — collapsible to a
 * 4rem icon rail — and moves into a drawer below `md`.
 */
export function AppShell({
  sidebar,
  topbar,
  children,
  className,
  navigationLabel = "Navigation",
  defaultCollapsed = false,
}: AppShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const value = useMemo(
    () => ({ mobileNavOpen, setMobileNavOpen, collapsed, setCollapsed }),
    [mobileNavOpen, collapsed],
  );
  // The mobile drawer always renders the expanded sidebar, even when the
  // desktop rail is collapsed, so override `collapsed` for that subtree.
  const drawerValue = useMemo(() => ({ ...value, collapsed: false }), [value]);

  return (
    <AppShellContext value={value}>
      <div
        data-slot="app-shell"
        className={cn("flex h-dvh w-full overflow-hidden bg-background text-foreground", className)}
      >
        <div
          data-slot="app-shell-sidebar"
          data-collapsed={collapsed ? "" : undefined}
          className={cn(
            "hidden shrink-0 border-e border-sidebar-border md:block",
            "transition-[width] duration-200 ease-in-out motion-reduce:transition-none",
            collapsed ? "w-16" : "w-64",
          )}
        >
          {sidebar}
        </div>
        <AppShellContext value={drawerValue}>
          <MobileDrawer title={navigationLabel}>{sidebar}</MobileDrawer>
        </AppShellContext>
        <div data-slot="app-shell-content" className="flex min-w-0 flex-1 flex-col">
          {topbar}
          {children}
        </div>
      </div>
    </AppShellContext>
  );
}
