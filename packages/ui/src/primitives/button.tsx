import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../cn";
import type { WithStringClassName } from "./class-name";
import { Spinner } from "./spinner";

export const buttonVariants = cva(
  [
    "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap",
    "rounded-md border border-transparent text-sm font-medium",
    "transition-colors duration-150 motion-reduce:transition-none",
    "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
    "disabled:pointer-events-none disabled:opacity-50",
    "aria-invalid:border-destructive",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/70",
        outline:
          "border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
        ghost: "text-foreground hover:bg-accent hover:text-accent-foreground",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:outline-destructive",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 gap-1.5 px-3 text-xs",
        md: "h-9 px-4",
        lg: "h-11 px-6 text-base",
        icon: "size-9 p-0",
      },
      loading: {
        true: "pointer-events-none",
        false: "",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
      loading: false,
    },
  },
);

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;
export type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>["size"]>;

export interface ButtonProps extends WithStringClassName<ButtonPrimitive.Props> {
  readonly variant?: ButtonVariant | undefined;
  readonly size?: ButtonSize | undefined;
  /** Shows a spinner and blocks interaction without collapsing the layout. */
  readonly loading?: boolean | undefined;
}

const SPINNER_SIZE = { sm: "sm", md: "sm", lg: "md", icon: "sm" } as const;

/**
 * Renders a native `<button>`. To render something else (a router link, for
 * example) pass Base UI's `render` prop — this package has no `asChild`.
 */
export function Button({
  className,
  variant = "default",
  size = "md",
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-loading={loading ? "" : undefined}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size, loading }), className)}
      {...props}
    >
      {loading ? <Spinner size={SPINNER_SIZE[size]} /> : null}
      {children}
    </ButtonPrimitive>
  );
}
