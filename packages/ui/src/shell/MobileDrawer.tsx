"use client";

import { Dialog } from "@base-ui/react/dialog";
import type { ReactNode } from "react";

import { backdropClassName } from "../primitives/popup";
import { useAppShell } from "./app-shell-context";

export interface MobileDrawerProps {
  readonly title: string;
  readonly children: ReactNode;
}

/**
 * The sidebar as an overlay on small screens. Slides in from the inline start,
 * so it comes from the right under `dir="rtl"`.
 */
export function MobileDrawer({ title, children }: MobileDrawerProps) {
  const { mobileNavOpen, setMobileNavOpen } = useAppShell();
  return (
    <Dialog.Root open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
      <Dialog.Portal>
        <Dialog.Backdrop
          data-slot="mobile-drawer-backdrop"
          className={`${backdropClassName} md:hidden`}
        />
        <Dialog.Popup
          data-slot="mobile-drawer"
          className={[
            "fixed inset-y-0 start-0 z-50 flex w-72 max-w-[calc(100vw-3rem)] flex-col border-e border-border bg-sidebar text-sidebar-foreground outline-none md:hidden",
            "transition-transform duration-200 ease-out motion-reduce:transition-none",
            "data-[starting-style]:-translate-x-full data-[ending-style]:-translate-x-full",
            "rtl:data-[starting-style]:translate-x-full rtl:data-[ending-style]:translate-x-full",
          ].join(" ")}
        >
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
