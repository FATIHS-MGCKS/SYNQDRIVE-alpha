export function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,38%)_1fr] gap-2 text-[12px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground break-words">{value}</span>
    </div>
  );
}

export function DetailPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="surface-premium rounded-xl border border-border/70 p-3 space-y-2">{children}</div>
  );
}

export function SecondaryId({ id }: { id: string }) {
  return (
    <span className="font-mono text-[10px] text-muted-foreground/80" title={id}>
      {id.slice(0, 8)}…
    </span>
  );
}
