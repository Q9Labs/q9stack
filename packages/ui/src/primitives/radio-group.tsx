import { Radio } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";

import { cn } from "../cn";
import type { WithStringClassName } from "./class-name";

export type RadioGroupProps<Value> = WithStringClassName<RadioGroupPrimitive.Props<Value>>;

export function RadioGroup<Value>({ className, ...props }: RadioGroupProps<Value>) {
  return (
    <RadioGroupPrimitive
      data-slot="radio-group"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}

export type RadioProps<Value> = WithStringClassName<Radio.Root.Props<Value>>;

export function RadioGroupItem<Value>({ className, ...props }: RadioProps<Value>) {
  return (
    <Radio.Root
      data-slot="radio"
      className={cn(
        "flex size-4.5 shrink-0 items-center justify-center rounded-full border border-input bg-background",
        "transition-colors duration-150 motion-reduce:transition-none",
        "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        "data-checked:border-primary data-checked:bg-primary",
        "data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <Radio.Indicator
        data-slot="radio-indicator"
        className="size-2 rounded-full bg-primary-foreground data-unchecked:hidden"
      />
    </Radio.Root>
  );
}
