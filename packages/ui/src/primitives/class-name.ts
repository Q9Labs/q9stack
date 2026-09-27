/**
 * Base UI accepts `className` as a string or a state callback. The design
 * system only ever merges strings, so every wrapper narrows the prop and keeps
 * `cn()` free of union handling.
 */
export type WithStringClassName<P> = Omit<P, "className"> & {
  className?: string | undefined;
};
