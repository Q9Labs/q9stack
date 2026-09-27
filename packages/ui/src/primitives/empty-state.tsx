import type { ReactNode } from "react";

import { cn } from "../cn";
import { Icon, type IconSvgElement } from "../icon";

export interface EmptyStateProps {
  readonly icon?: IconSvgElement | undefined;
  readonly title: string;
  readonly description?: string | undefined;
  /** Primary call to action; usually a `<Button>`. */
  readonly action?: ReactNode;
  readonly className?: string | undefined;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? (
        <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon icon={icon} size="lg" />
        </span>
      ) : null}
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description === undefined ? null : (
          <p className="max-w-prose text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
