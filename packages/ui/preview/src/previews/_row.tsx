import type { ReactNode } from "react";

export function Row({ children }: { readonly children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

export function Stack({ children }: { readonly children: ReactNode }) {
  return <div className="flex flex-col gap-6">{children}</div>;
}

export function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h2>
      {children}
    </section>
  );
}
