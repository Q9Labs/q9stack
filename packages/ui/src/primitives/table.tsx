import type { ComponentPropsWithRef } from "react";

import { cn } from "../cn";

export function Table({ className, ...props }: ComponentPropsWithRef<"table">) {
  return (
    <div data-slot="table-container" className="w-full overflow-x-auto">
      <table
        data-slot="table"
        className={cn("w-full caption-bottom border-collapse text-sm", className)}
        {...props}
      />
    </div>
  );
}

export function TableHeader({ className, ...props }: ComponentPropsWithRef<"thead">) {
  return <thead data-slot="table-header" className={cn("[&_tr]:border-b", className)} {...props} />;
}

export function TableBody({ className, ...props }: ComponentPropsWithRef<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

export function TableFooter({ className, ...props }: ComponentPropsWithRef<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn("border-t bg-muted/50 font-medium", className)}
      {...props}
    />
  );
}

export function TableRow({ className, ...props }: ComponentPropsWithRef<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b border-border transition-colors duration-100 hover:bg-muted/50 data-selected:bg-muted motion-reduce:transition-none",
        className,
      )}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: ComponentPropsWithRef<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-3 text-start align-middle text-xs font-medium text-muted-foreground whitespace-nowrap",
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: ComponentPropsWithRef<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn("px-3 py-2.5 align-middle text-start", className)}
      {...props}
    />
  );
}

export function TableCaption({ className, ...props }: ComponentPropsWithRef<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-3 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}
