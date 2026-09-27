/**
 * Shared visual language for every floating surface (dialog, popover, menu,
 * select, tooltip) so they cannot drift apart.
 */
export const popupSurfaceClassName = [
  "rounded-lg border border-border bg-popover text-popover-foreground shadow-lg",
  "origin-(--transform-origin) outline-none",
].join(" ");

export const popupMotionClassName = [
  "transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none",
  "data-[starting-style]:scale-98 data-[starting-style]:opacity-0",
  "data-[ending-style]:scale-98 data-[ending-style]:opacity-0",
].join(" ");

export const backdropClassName = [
  "fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px]",
  "transition-opacity duration-150 motion-reduce:transition-none",
  "data-[starting-style]:opacity-0 data-[ending-style]:opacity-0",
].join(" ");

export const menuItemClassName = [
  "flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none",
  "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
  "data-disabled:pointer-events-none data-disabled:opacity-50",
].join(" ");
