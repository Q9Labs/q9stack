import { Field as FieldPrimitive } from "@base-ui/react/field";

import { cn } from "../cn";
import type { WithStringClassName } from "./class-name";
import { labelClassName } from "./label";

export type FieldProps = WithStringClassName<FieldPrimitive.Root.Props>;

/**
 * Wires label, control, description and error together. Base UI generates the
 * ids and the `aria-describedby`/`aria-labelledby` links; nothing here does.
 */
export function Field({ className, ...props }: FieldProps) {
  return (
    <FieldPrimitive.Root
      data-slot="field"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}

export type FieldLabelProps = WithStringClassName<FieldPrimitive.Label.Props>;

export function FieldLabel({ className, ...props }: FieldLabelProps) {
  return (
    <FieldPrimitive.Label
      data-slot="field-label"
      className={cn(labelClassName, className)}
      {...props}
    />
  );
}

export type FieldDescriptionProps = WithStringClassName<FieldPrimitive.Description.Props>;

export function FieldDescription({ className, ...props }: FieldDescriptionProps) {
  return (
    <FieldPrimitive.Description
      data-slot="field-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export type FieldErrorProps = WithStringClassName<FieldPrimitive.Error.Props>;

export function FieldError({ className, ...props }: FieldErrorProps) {
  return (
    <FieldPrimitive.Error
      data-slot="field-error"
      className={cn("text-sm font-medium text-destructive", className)}
      {...props}
    />
  );
}

export const FieldControl = FieldPrimitive.Control;

export const FieldValidity = FieldPrimitive.Validity;
