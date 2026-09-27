import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import type { ComponentPropsWithRef } from "react";

import { cn } from "../cn";
import { Icon } from "../icon";
import type { WithStringClassName } from "./class-name";
import { backdropClassName, popupSurfaceClassName } from "./popup";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export type DialogContentProps = WithStringClassName<DialogPrimitive.Popup.Props> & {
  /** Renders the top-end close button. Turn it off for flows that must be dismissed explicitly. */
  readonly showClose?: boolean | undefined;
  readonly closeLabel?: string | undefined;
};

export function DialogContent({
  className,
  children,
  showClose = true,
  closeLabel = "Close",
  ...props
}: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop data-slot="dialog-backdrop" className={backdropClassName} />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          popupSurfaceClassName,
          "fixed start-1/2 top-1/2 z-50 flex w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-4 p-6 rtl:translate-x-1/2",
          "transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none",
          "data-[starting-style]:opacity-0 data-[ending-style]:opacity-0",
          className,
        )}
        {...props}
      >
        {children}
        {showClose ? (
          <DialogPrimitive.Close
            data-slot="dialog-close"
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

export type DialogTitleProps = WithStringClassName<DialogPrimitive.Title.Props>;

export function DialogTitle({ className, ...props }: DialogTitleProps) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-base font-semibold text-foreground", className)}
      {...props}
    />
  );
}

export type DialogDescriptionProps = WithStringClassName<DialogPrimitive.Description.Props>;

export function DialogDescription({ className, ...props }: DialogDescriptionProps) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export function DialogHeader({ className, ...props }: ComponentPropsWithRef<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-1.5 pe-8 text-start", className)}
      {...props}
    />
  );
}

export function DialogFooter({ className, ...props }: ComponentPropsWithRef<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}
