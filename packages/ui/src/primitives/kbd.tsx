import type { ComponentPropsWithRef } from "react";

import { cn } from "../cn";

export function Kbd({ className, ...props }: ComponentPropsWithRef<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center gap-1 rounded border border-border bg-muted px-1.5",
        "font-sans text-[0.6875rem] font-medium text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
