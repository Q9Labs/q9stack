import type { ComponentPropsWithRef } from "react";

import { cn } from "../cn";

export function Main({ className, ...props }: ComponentPropsWithRef<"main">) {
  return (
    <main
      data-slot="main"
      className={cn("flex-1 overflow-y-auto px-6 py-8", className)}
      {...props}
    />
  );
}
