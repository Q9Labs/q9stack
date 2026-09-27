"use client";

import { Toaster as SonnerToaster, type ToasterProps as SonnerToasterProps } from "sonner";

import { useThemeOptional } from "../theme/index";

export { toast } from "sonner";

export type ToasterProps = Omit<SonnerToasterProps, "theme" | "dir">;

/**
 * Sonner styled from the design tokens. Scheme and direction follow
 * `<ThemeProvider>` when one is mounted, and the browser otherwise.
 */
export function Toaster({ position, ...props }: ToasterProps) {
  const theme = useThemeOptional();
  const dir = theme?.dir ?? "auto";
  const inlineEndBottom = dir === "rtl" ? "bottom-left" : "bottom-right";
  return (
    <SonnerToaster
      data-slot="toaster"
      theme={theme?.resolvedScheme ?? "system"}
      dir={dir}
      position={position ?? inlineEndBottom}
      toastOptions={{
        classNames: {
          toast:
            "group flex w-full items-center gap-3 rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-lg",
          title: "text-sm font-medium",
          description: "text-sm text-muted-foreground",
          actionButton:
            "inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground",
          cancelButton:
            "inline-flex h-8 items-center rounded-md bg-muted px-3 text-xs font-medium text-muted-foreground",
          error: "border-destructive/40",
        },
      }}
      {...props}
    />
  );
}
