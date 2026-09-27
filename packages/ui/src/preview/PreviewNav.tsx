"use client";

import { cn } from "../cn";
import { type Preview, previewId, scenarioId } from "./define-preview";

export interface PreviewNavProps {
  readonly previews: readonly Preview[];
  readonly activePreviewId: string;
  readonly activeScenarioId: string;
  readonly onSelect: (previewId: string, scenarioId: string) => void;
}

export function PreviewNav({
  previews,
  activePreviewId,
  activeScenarioId,
  onSelect,
}: PreviewNavProps) {
  return (
    <nav
      data-slot="preview-nav"
      aria-label="Previews"
      className="flex w-56 shrink-0 flex-col gap-4 overflow-y-auto border-e border-border bg-sidebar p-4"
    >
      {previews.map((preview) => {
        const id = previewId(preview);
        return (
          <div key={id} className="flex flex-col gap-1">
            <p className="px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {preview.title}
            </p>
            {preview.scenarios.map((scenario) => {
              const child = scenarioId(scenario);
              const active = id === activePreviewId && child === activeScenarioId;
              return (
                <button
                  key={child}
                  type="button"
                  data-preview-id={id}
                  data-scenario-id={child}
                  aria-current={active ? "true" : undefined}
                  onClick={() => onSelect(id, child)}
                  className={cn(
                    "rounded-md px-2 py-1.5 text-start text-sm text-sidebar-foreground",
                    "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    active
                      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                      : "hover:bg-sidebar-accent/60",
                  )}
                >
                  {scenario.name}
                </button>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
