import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { StatusChip } from '../../../../components/patterns';
import { cn } from '../../../../components/ui/utils';
import {
  formatCompanyActivityTimestamp,
  type CompanyActivityViewEntry,
} from './company-activity-mapper';

interface CompanyActivityTimelineProps {
  items: CompanyActivityViewEntry[];
}

export function CompanyActivityTimeline({ items }: CompanyActivityTimelineProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <ol className="divide-y divide-border/60">
      {items.map((item) => {
        const hasTechnicalDetails = Boolean(item.technicalDetails?.length);
        const isExpanded = expandedId === item.id;

        return (
          <li key={item.id} className="py-2.5 first:pt-0 last:pb-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-medium text-foreground">{item.title}</p>
                  <StatusChip tone="neutral" className="h-5 px-1.5 text-[10px]">
                    {item.categoryLabel}
                  </StatusChip>
                </div>
                {item.actor ? (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{item.actor}</p>
                ) : null}
                {item.subtitle ? (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{item.subtitle}</p>
                ) : null}
              </div>
              <time
                dateTime={item.timestamp}
                className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
              >
                {formatCompanyActivityTimestamp(item.timestamp)}
              </time>
            </div>

            {hasTechnicalDetails ? (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ChevronDown
                    className={cn('size-3.5 transition-transform', isExpanded && 'rotate-180')}
                  />
                  Technische Details
                  {item.sourceIds.length > 1 ? ` (${item.sourceIds.length})` : ''}
                </button>
                {isExpanded ? (
                  <ul className="mt-1.5 space-y-1 rounded-lg border border-border/60 bg-muted/20 p-2.5">
                    {item.technicalDetails?.map((detail, index) => (
                      <li
                        key={`${item.id}-detail-${index}`}
                        className="break-all font-mono text-[10px] leading-relaxed text-muted-foreground"
                      >
                        {detail}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
