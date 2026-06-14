import type { ReactNode } from 'react';
import { cn } from '../ui/utils';
import { dotClassForTone, type StatusTone } from './status-utils';

/* ════════════════════════════════════════════════════════════════════
   Timeline — vertical history rail for vehicle events, health history,
   booking lifecycle and task history. One component, consistent rhythm.
   ════════════════════════════════════════════════════════════════════ */

export interface TimelineItem {
  id: string;
  title: ReactNode;
  time?: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  tone?: StatusTone;
  /** Override the node marker entirely (e.g. an icon). */
  marker?: ReactNode;
}

export interface TimelineProps {
  items: TimelineItem[];
  className?: string;
}

export function Timeline({ items, className }: TimelineProps) {
  return (
    <ol className={cn('relative space-y-0', className)}>
      {items.map((item, i) => {
        const last = i === items.length - 1;
        return (
          <li key={item.id} className="relative flex gap-3 pb-4 last:pb-0">
            {/* Rail + node */}
            <div className="relative flex flex-col items-center">
              <span className="mt-1 flex h-3.5 w-3.5 items-center justify-center">
                {item.marker ?? (
                  <span className={cn('sq-dot h-2.5 w-2.5', dotClassForTone(item.tone ?? 'neutral'))} />
                )}
              </span>
              {!last && <span className="mt-1 w-px flex-1 bg-border" aria-hidden />}
            </div>
            {/* Content */}
            <div className="min-w-0 flex-1 pb-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[13px] font-semibold text-foreground">
                  {item.title}
                </span>
                {item.time && (
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {item.time}
                  </span>
                )}
              </div>
              {item.description && (
                <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                  {item.description}
                </p>
              )}
              {item.meta && <div className="mt-1 flex flex-wrap gap-1.5">{item.meta}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
