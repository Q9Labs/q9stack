import type { ComponentPropsWithRef } from "react";

import { cn } from "../cn";

export function Skeleton({ className, ...props }: ComponentPropsWithRef<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-muted motion-reduce:animate-none", className)}
      {...props}
    />
  );
}
