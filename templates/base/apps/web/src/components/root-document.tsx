import { HeadContent, Scripts } from "@tanstack/react-router";
import type { ReactNode } from "react";

export function RootDocument({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}
