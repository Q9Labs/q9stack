"use client";

import { DirectionProvider } from "@base-ui/react/direction-provider";
import type { ReactNode } from "react";

import { cn } from "../cn";
import type { Direction } from "../theme/scheme";
import type { PreviewEnvironment } from "./environment";
import { PreviewEnvironmentProvider } from "./environment-context";

export interface PreviewStageProps {
  readonly environment: PreviewEnvironment;
  readonly dir: Direction;
  readonly label?: string | undefined;
  readonly children: ReactNode;
}

/**
 * Paints one scenario under a scheme, direction and product palette. It is a
 * plain element rather than an iframe so devtools inspection stays in one tree.
 */
export function PreviewStage({ environment, dir, label, children }: PreviewStageProps) {
  return (
    <div data-slot="preview-stage" className="flex min-w-0 flex-1 flex-col gap-2">
      {label === undefined ? null : (
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </span>
      )}
      <div
        dir={dir}
        lang={environment.locale}
        data-theme={environment.productTheme}
        data-scheme={environment.scheme}
        className={cn(
          "min-w-0 flex-1 overflow-auto rounded-lg border border-border bg-background p-6 text-foreground",
          environment.scheme === "dark" && "dark",
        )}
      >
        <PreviewEnvironmentProvider value={{ ...environment, dir }}>
          <DirectionProvider direction={dir}>{children}</DirectionProvider>
        </PreviewEnvironmentProvider>
      </div>
    </div>
  );
}
