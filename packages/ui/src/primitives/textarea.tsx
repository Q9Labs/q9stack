import type { ComponentPropsWithRef } from "react";

import { cn } from "../cn";
import { inputClassName } from "./input";

export type TextareaProps = ComponentPropsWithRef<"textarea">;

export function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(inputClassName, "field-sizing-content min-h-20 resize-y py-2", className)}
      {...props}
    />
  );
}
