import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { MinusSignIcon, Tick02Icon } from "@hugeicons/core-free-icons";

import { cn } from "../cn";
import { Icon } from "../icon";
import type { WithStringClassName } from "./class-name";

export type CheckboxProps = WithStringClassName<CheckboxPrimitive.Root.Props>;

export function Checkbox({ className, ...props }: CheckboxProps) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "flex size-4.5 shrink-0 items-center justify-center rounded-[0.3rem] border border-input bg-background text-primary-foreground",
        "transition-colors duration-150 motion-reduce:transition-none",
        "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        "data-checked:border-primary data-checked:bg-primary data-indeterminate:border-primary data-indeterminate:bg-primary",
        "data-disabled:cursor-not-allowed data-disabled:opacity-50",
        "aria-invalid:border-destructive",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex data-unchecked:hidden"
        render={(indicatorProps, state) => (
          <span {...indicatorProps}>
            <Icon
              icon={state.indeterminate ? MinusSignIcon : Tick02Icon}
              size="sm"
              className="size-3.5"
            />
          </span>
        )}
      />
    </CheckboxPrimitive.Root>
  );
}
