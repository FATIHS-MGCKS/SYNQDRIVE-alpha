import { useMemo, useState } from 'react';
import { Clock } from 'lucide-react';

import { Button } from '../../../components/ui/button';
import { cn } from '../../../components/ui/utils';
import { EmptyState, StatusChip } from '../../../components/patterns';
import { EM_DASH, formatDateTime } from './customerDetailUtils';

type TimelineFilter = 'all' | 'document' | 'booking' | 'status' | 'risk' | 'payment' | 'fine' | 'note';

const FILTER_OPTIONS: { value: TimelineFilter; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'document', label: 'Dokumente' },
  { value: 'booking', label: 'Buchungen' },
  { value: 'status', label: 'Status' },
  { value: 'risk', label: 'Risiko' },
  { value: 'payment', label: 'Zahlungen' },
  { value: 'fine', label: 'Bußgelder' },
  { value: 'note', label: 'Notizen' },
];

interface CustomerTimelineTabProps {
  events: Array<Record<string, unknown>>;
  loading?: boolean;
  error?: string | null;
  onAddNote: () => void;
}

export function CustomerTimelineTab({
  events,
  loading,
  error,
  onAddNote,
}: CustomerTimelineTabProps) {
  const [filter, setFilter] = useState<TimelineFilter>('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return events;
    return events.filter((ev) => {
      const type = String(ev.type ?? ev.eventType ?? '').toUpperCase();
      if (filter === 'note') return type.includes('NOTE');
      if (filter === 'document') return type.includes('DOCUMENT');
      if (filter === 'booking') return type.includes('BOOKING');
      if (filter === 'status') return type.includes('STATUS');
      if (filter === 'risk') return type.includes('RISK');
      if (filter === 'payment') return type.includes('PAYMENT') || type.includes('INVOICE');
      if (filter === 'fine') return type.includes('FINE');
      return true;
    });
  }, [events, filter]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {FILTER_OPTIONS.map((o) => {
            const active = filter === o.value;
            return (
              <Button
                key={o.value}
                type="button"
                size="sm"
                variant={active ? 'outline' : 'ghost'}
                className={cn('h-7 px-2.5 text-[11px]', active && 'bg-card shadow-sm')}
                onClick={() => setFilter(o.value)}
              >
                {o.label}
              </Button>
            );
          })}
        </div>
        <Button type="button" size="sm" variant="neutral" onClick={onAddNote}>
          Notiz hinzufügen
        </Button>
      </div>

      {error ? (
        <p className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-[12px] text-muted-foreground">
          Timeline konnte nicht geladen werden.
        </p>
      ) : null}

      {loading ? (
        <p className="py-8 text-center text-[12px] text-muted-foreground">Timeline wird geladen…</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Clock className="size-5" />}
          title="Keine Einträge"
          description="Für diesen Filter sind noch keine Timeline-Ereignisse vorhanden."
        />
      ) : (
        <div className="sq-card divide-y divide-border overflow-hidden">
          {filtered.map((ev) => (
            <div key={String(ev.id)} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusChip tone="neutral" className="text-[9px]">
                      {String(ev.type ?? ev.eventType ?? 'EVENT')}
                    </StatusChip>
                    <span className="text-[12px] font-semibold text-foreground">
                      {String(ev.title ?? 'Ereignis')}
                    </span>
                  </div>
                  {ev.description ? (
                    <p className="mt-1 whitespace-pre-wrap text-[12px] text-muted-foreground">
                      {String(ev.description)}
                    </p>
                  ) : null}
                  {ev.createdByName ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      von {String(ev.createdByName)}
                    </p>
                  ) : null}
                </div>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {ev.createdAt ? formatDateTime(String(ev.createdAt)) : EM_DASH}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
