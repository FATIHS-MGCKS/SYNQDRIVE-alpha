import type { ReactNode } from 'react';

interface OperatorTodaySectionProps {
  title: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
  empty?: ReactNode;
  isEmpty?: boolean;
}

export function OperatorTodaySection({
  title,
  count,
  action,
  children,
  empty,
  isEmpty,
}: OperatorTodaySectionProps) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <h2 className="font-display text-sm font-bold tracking-tight text-foreground">{title}</h2>
        <div className="flex items-center gap-2">
          {action}
          {typeof count === 'number' && (
            <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">{count}</span>
          )}
        </div>
      </div>
      {isEmpty && empty ? empty : children}
    </section>
  );
}
