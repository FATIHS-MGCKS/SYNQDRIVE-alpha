import { useMemo, useState } from 'react';

import { Icon } from '../ui/Icon';
import { useInvoiceTimeline } from './hooks/useInvoiceTimeline';
import { mapInvoiceTimelinePanel } from './invoiceTimeline.mapper';
import type { InvoiceThemeClasses } from './invoiceTheme';

interface InvoiceTimelineProps extends Partial<InvoiceThemeClasses> {
  orgId: string;
  invoiceId: string;
  embedded?: boolean;
}

export function InvoiceTimeline({ orgId, invoiceId, card, tp, ts, embedded = false }: InvoiceTimelineProps) {
  const { panel, loading, error } = useInvoiceTimeline(orgId, invoiceId);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const items = useMemo(() => (panel ? mapInvoiceTimelinePanel(panel) : []), [panel]);

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const titleClass = tp ?? 'text-foreground';
  const mutedClass = ts ?? 'text-muted-foreground';

  return (
    <div className={embedded ? 'space-y-2 pt-2 border-t border-border/40' : `${card} p-5 space-y-3`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className={`text-[10px] font-semibold ${titleClass} uppercase tracking-wider`}>Verlauf</h3>
        {panel?.isLegacyReduced ? (
          <span className={`text-[10px] ${mutedClass}`} title="Reduzierter Verlauf für ältere Rechnungen">
            Basis-Verlauf
          </span>
        ) : null}
      </div>

      {loading && !panel ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
          <Icon name="loader-2" className="h-4 w-4 animate-spin" />
          Verlauf wird geladen…
        </div>
      ) : null}

      {error && !panel ? (
        <p className="text-xs text-[color:var(--status-critical)]" role="alert">
          {error}
        </p>
      ) : null}

      {panel && items.length === 0 ? (
        <p className={`text-xs ${mutedClass}`}>Noch keine Ereignisse für diese Rechnung.</p>
      ) : null}

      {items.length > 0 ? (
        <ol className="relative space-y-0" aria-label="Rechnungsverlauf">
          {items.map((item, index) => {
            const last = index === items.length - 1;
            const expanded = expandedIds.has(item.id);
            const canExpand = item.hasCollapsibleDetail;

            return (
              <li key={item.id} className="relative flex gap-3 pb-3 last:pb-0">
                <div className="relative flex flex-col items-center">
                  <span className="mt-1 flex h-3.5 w-3.5 items-center justify-center">
                    <span
                      className={`sq-dot h-2.5 w-2.5 ${
                        item.tone === 'success'
                          ? 'bg-[color:var(--status-positive)]'
                          : item.tone === 'critical'
                            ? 'bg-[color:var(--status-critical)]'
                            : item.tone === 'watch'
                              ? 'bg-[color:var(--status-watch)]'
                              : item.tone === 'info'
                                ? 'bg-[color:var(--status-info)]'
                                : 'bg-muted-foreground/50'
                      }`}
                      aria-hidden
                    />
                  </span>
                  {!last ? <span className="mt-1 w-px flex-1 bg-border" aria-hidden /> : null}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-xs font-semibold leading-snug ${titleClass}`}>{item.title}</p>
                    <time
                      className={`shrink-0 text-[10px] tabular-nums ${mutedClass}`}
                      dateTime={item.occurredAt}
                    >
                      {item.time}
                    </time>
                  </div>

                  <p className={`mt-0.5 text-[11px] leading-snug ${mutedClass}`}>{item.actorLine}</p>

                  {item.detail && canExpand ? (
                    <button
                      type="button"
                      onClick={() => toggleExpanded(item.id)}
                      className="mt-1 text-left text-[11px] font-medium text-brand hover:underline"
                      aria-expanded={expanded}
                    >
                      {expanded ? 'Weniger anzeigen' : 'Details anzeigen'}
                    </button>
                  ) : null}

                  {item.detail && (!canExpand || expanded) ? (
                    <p className={`mt-1 text-[11px] leading-relaxed ${mutedClass}`}>{item.detail}</p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}

      {panel?.sortOrder === 'desc' ? (
        <p className={`text-[10px] ${mutedClass}`}>Neueste Ereignisse zuerst</p>
      ) : null}
    </div>
  );
}
