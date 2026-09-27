import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Cancel01Icon } from "@hugeicons/core-free-icons";

import { cn } from "../cn";
import { Icon } from "../icon";
import type { WithStringClassName } from "./class-name";
import { backdropClassName } from "./popup";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

/** Edges are logical: `start`/`end` follow the writing direction. */
export type SheetSide = "start" | "end" | "top" | "bottom";

const SIDE_CLASSES = {
  start: [
    "inset-y-0 start-0 h-full w-80 max-w-[calc(100vw-3rem)] border-e",
    "data-[starting-style]:-translate-x-full data-[ending-style]:-translate-x-full",
    "rtl:data-[starting-style]:translate-x-full rtl:data-[ending-style]:translate-x-full",
  ],
  end: [
    "inset-y-0 end-0 h-full w-80 max-w-[calc(100vw-3rem)] border-s",
    "data-[starting-style]:translate-x-full data-[ending-style]:translate-x-full",
    "rtl:data-[starting-style]:-translate-x-full rtl:data-[ending-style]:-translate-x-full",
  ],
  top: [
    "inset-x-0 top-0 max-h-[80vh] w-full border-b",
    "data-[starting-style]:-translate-y-full data-[ending-style]:-translate-y-full",
  ],
  bottom: [
    "inset-x-0 bottom-0 max-h-[80vh] w-full border-t",
    "data-[starting-style]:translate-y-full data-[ending-style]:translate-y-full",
  ],
} as const;

export type SheetContentProps = WithStringClassName<DialogPrimitive.Popup.Props> & {
  readonly side?: SheetSide | undefined;
  readonly showClose?: boolean | undefined;
  readonly closeLabel?: string | undefined;
};

export function SheetContent({
  className,
  children,
  side = "end",
  showClose = true,
  closeLabel = "Close",
  ...props
}: SheetContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop data-slot="sheet-backdrop" className={backdropClassName} />
      <DialogPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "fixed z-50 flex flex-col gap-4 border-border bg-popover p-6 text-popover-foreground shadow-lg outline-none",
          "transition-transform duration-200 ease-out motion-reduce:transition-none",
          SIDE_CLASSES[side].join(" "),
          className,
        )}
        {...props}
      >
        {children}
        {showClose ? (
          <DialogPrimitive.Close
            data-slot="sheet-close"
            aria-label={closeLabel}
            className={cn(
              "absolute end-4 top-4 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground",
              "transition-colors duration-150 hover:bg-accent hover:text-accent-foreground motion-reduce:transition-none",
              "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            )}
          >
            <Icon icon={Cancel01Icon} size="sm" />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}
