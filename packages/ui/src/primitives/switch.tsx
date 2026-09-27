import { Switch as SwitchPrimitive } from "@base-ui/react/switch";

import { cn } from "../cn";
import type { WithStringClassName } from "./class-name";

export type SwitchProps = WithStringClassName<SwitchPrimitive.Root.Props>;

export function Switch({ className, ...props }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent bg-muted p-0.5",
        "transition-colors duration-150 motion-reduce:transition-none",
        "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        "data-checked:bg-primary",
        "data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "size-4 rounded-full bg-background shadow-sm",
          "transition-transform duration-150 motion-reduce:transition-none",
          "translate-x-0 data-checked:translate-x-4 rtl:data-checked:-translate-x-4",
        )}
      />
    </SwitchPrimitive.Root>
  );
}
