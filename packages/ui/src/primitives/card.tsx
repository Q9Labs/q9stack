import type { ComponentPropsWithRef } from "react";

import { cn } from "../cn";

export function Card({ className, ...props }: ComponentPropsWithRef<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "flex flex-col gap-6 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-xs",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentPropsWithRef<"div">) {
  return (
    <div data-slot="card-header" className={cn("flex flex-col gap-1.5", className)} {...props} />
  );
}

export function CardTitle({ className, children, ...props }: ComponentPropsWithRef<"h3">) {
  return (
    <h3
      data-slot="card-title"
      className={cn("text-base font-semibold leading-none text-foreground", className)}
      {...props}
    >
      {children}
    </h3>
  );
}

export function CardDescription({ className, ...props }: ComponentPropsWithRef<"p">) {
  return (
    <p
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: ComponentPropsWithRef<"div">) {
  return (
    <div data-slot="card-content" className={cn("flex flex-col gap-4", className)} {...props} />
  );
}

export function CardFooter({ className, ...props }: ComponentPropsWithRef<"div">) {
  return (
    <div data-slot="card-footer" className={cn("flex items-center gap-2", className)} {...props} />
  );
}
