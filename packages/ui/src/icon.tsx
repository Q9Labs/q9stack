import { HugeiconsIcon, type HugeiconsIconProps, type IconSvgElement } from "@hugeicons/react";
import type { Ref } from "react";

import { cn } from "./cn";

export type { IconSvgElement };

const SIZES = {
  sm: 16,
  md: 20,
  lg: 24,
} as const;

export type IconSize = keyof typeof SIZES;

export interface IconProps extends Omit<
  HugeiconsIconProps,
  "size" | "className" | "aria-hidden" | "role" | "aria-label"
> {
  readonly icon: IconSvgElement;
  readonly size?: IconSize | undefined;
  readonly className?: string | undefined;
  /** Mirrors directional icons (arrows, chevrons) in right-to-left locales. */
  readonly flipInRtl?: boolean | undefined;
  /** Promotes the icon from decorative to a labelled image. */
  readonly label?: string | undefined;
  readonly ref?: Ref<SVGSVGElement> | undefined;
}

/**
 * The single icon surface of the design system. Icons are decorative by
 * default (`aria-hidden`); passing `label` makes them a named `role="img"`.
 */
export function Icon({
  icon,
  size = "md",
  className,
  flipInRtl = false,
  label,
  ref,
  ...props
}: IconProps) {
  const labelled = label !== undefined;
  return (
    <HugeiconsIcon
      ref={ref}
      icon={icon}
      size={SIZES[size]}
      data-slot="icon"
      className={cn("shrink-0", flipInRtl && "rtl:-scale-x-100", className)}
      aria-hidden={labelled ? undefined : true}
      role={labelled ? "img" : undefined}
      aria-label={label}
      {...props}
    />
  );
}
