import type { ReactNode } from 'react';

interface OperatorTodaySectionProps {
  title: string;
  count?: number;
  children: ReactNode;
  empty?: ReactNode;
  isEmpty?: boolean;
}

export function OperatorTodaySection({
  title,
  count,
  children,
  empty,
  isEmpty,
}: OperatorTodaySectionProps) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-2 px-0.5">
        <h2 className="font-display text-sm font-bold tracking-tight text-foreground">{title}</h2>
        {typeof count === 'number' && (
          <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">{count}</span>
        )}
      </div>
      {isEmpty && empty ? empty : children}
    </section>
  );
}
