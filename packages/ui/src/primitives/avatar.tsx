import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar";

import { cn } from "../cn";
import type { WithStringClassName } from "./class-name";

const SIZES = {
  sm: "size-7 text-xs",
  md: "size-9 text-sm",
  lg: "size-12 text-base",
} as const;

export type AvatarSize = keyof typeof SIZES;

export type AvatarProps = WithStringClassName<AvatarPrimitive.Root.Props> & {
  readonly size?: AvatarSize | undefined;
};

export function Avatar({ className, size = "md", ...props }: AvatarProps) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      data-size={size}
      className={cn(
        "relative flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-muted",
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
}

export type AvatarImageProps = WithStringClassName<AvatarPrimitive.Image.Props>;

export function AvatarImage({ className, ...props }: AvatarImageProps) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("size-full object-cover", className)}
      {...props}
    />
  );
}

export type AvatarFallbackProps = WithStringClassName<AvatarPrimitive.Fallback.Props>;

export function AvatarFallback({ className, ...props }: AvatarFallbackProps) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn("font-medium text-muted-foreground", className)}
      {...props}
    />
  );
}
