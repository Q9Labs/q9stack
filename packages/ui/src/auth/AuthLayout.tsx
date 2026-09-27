import type { ReactNode } from "react";

import { cn } from "../cn";

export interface AuthLayoutProps {
  /** Brand mark shown above the card. */
  readonly logo?: ReactNode;
  /** Small print under the card: legal links, support, locale switcher. */
  readonly footer?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string | undefined;
}

/** Centred single-card frame shared by every unauthenticated screen. */
export function AuthLayout({ logo, footer, children, className }: AuthLayoutProps) {
  return (
    <div
      data-slot="auth-layout"
      className={cn(
        "flex min-h-dvh w-full flex-col items-center justify-center gap-6 bg-background px-4 py-12 text-foreground",
        className,
      )}
    >
      {logo === undefined ? null : (
        <div data-slot="auth-layout-logo" className="flex items-center justify-center">
          {logo}
        </div>
      )}
      <div
        data-slot="auth-layout-card"
        className="w-full max-w-sm rounded-xl border border-border bg-card p-6 text-card-foreground shadow-xs"
      >
        {children}
      </div>
      {footer === undefined ? null : (
        <div
          data-slot="auth-layout-footer"
          className="max-w-sm text-center text-xs text-muted-foreground"
        >
          {footer}
        </div>
      )}
    </div>
  );
}
