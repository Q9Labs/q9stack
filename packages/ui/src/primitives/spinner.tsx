import { cn } from "../cn";

const SIZES = {
  sm: "size-3.5 border-[1.5px]",
  md: "size-4 border-2",
  lg: "size-6 border-2",
} as const;

export type SpinnerSize = keyof typeof SIZES;

export interface SpinnerProps {
  readonly size?: SpinnerSize | undefined;
  readonly className?: string | undefined;
  /** Announced to screen readers; omit for spinners inside a labelled control. */
  readonly label?: string | undefined;
}

export function Spinner({ size = "md", className, label }: SpinnerProps) {
  const labelled = label !== undefined;
  return (
    <span
      data-slot="spinner"
      role={labelled ? "status" : undefined}
      aria-label={label}
      aria-hidden={labelled ? undefined : true}
      className={cn(
        "inline-block shrink-0 animate-spin rounded-full border-current border-t-transparent motion-reduce:animate-[spin_1.5s_linear_infinite]",
        SIZES[size],
        className,
      )}
    />
  );
}
