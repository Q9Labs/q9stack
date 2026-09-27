import { Input as InputPrimitive } from "@base-ui/react/input";

import { cn } from "../cn";
import type { WithStringClassName } from "./class-name";

export const inputClassName = [
  "flex h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-xs",
  "placeholder:text-muted-foreground",
  "transition-[color,box-shadow,border-color] duration-150 motion-reduce:transition-none",
  "outline-none focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "aria-invalid:border-destructive aria-invalid:focus-visible:outline-destructive",
  "file:me-3 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
].join(" ");

export type InputProps = WithStringClassName<InputPrimitive.Props>;

export function Input({ className, ...props }: InputProps) {
  return <InputPrimitive data-slot="input" className={cn(inputClassName, className)} {...props} />;
}
