import type { ComponentPropsWithRef } from "react";

import { cn } from "../cn";

export const labelClassName =
  "flex select-none items-center gap-2 text-sm font-medium leading-none text-foreground data-disabled:opacity-50";

export type LabelProps = ComponentPropsWithRef<"label">;

/**
 * A standalone `<label>`; pair it with `htmlFor`. Inside a `<Field>` use
 * `<FieldLabel>` instead, which wires itself to the field's control.
 */
export function Label({ className, htmlFor, children, ...props }: LabelProps) {
  return (
    <label data-slot="label" htmlFor={htmlFor} className={cn(labelClassName, className)} {...props}>
      {children}
    </label>
  );
}
