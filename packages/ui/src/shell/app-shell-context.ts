"use client";

import { createContext, use } from "react";

export interface AppShellContextValue {
  readonly mobileNavOpen: boolean;
  readonly setMobileNavOpen: (open: boolean) => void;
  /** Whether the desktop sidebar is collapsed to an icon-only rail. */
  readonly collapsed: boolean;
  readonly setCollapsed: (collapsed: boolean) => void;
}

export const AppShellContext = createContext<AppShellContextValue | null>(null);

export class AppShellMissingError extends Error {
  // fallow-ignore-next-line unused-class-member -- Public discriminant for typed consumers.
  readonly _tag = "AppShellMissingError";

  constructor() {
    super("useAppShell() was called outside of <AppShell>.");
    this.name = "AppShellMissingError";
  }
}

export function useAppShellOptional(): AppShellContextValue | null {
  return use(AppShellContext);
}

export function useAppShell(): AppShellContextValue {
  const value = useAppShellOptional();
  if (value === null) {
    throw new AppShellMissingError();
  }
  return value;
}

/** Collapse state for shell subcomponents that render outside `useAppShell()`. */
export function useSidebarCollapsed(): boolean {
  return useAppShellOptional()?.collapsed ?? false;
}
