import { useMemo, useState } from 'react';
import { Icon } from '../ui/Icon';
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
    const needle = filter.toUpperCase();
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap gap-1">
          {FILTER_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setFilter(o.value)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-medium ${
                filter === o.value
                  ? 'bg-card border border-border shadow-sm'
                  : 'text-muted-foreground hover:bg-muted/60'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onAddNote}
          className="px-3 py-1.5 rounded-lg text-[10px] font-semibold sq-tone-brand"
        >
          Notiz hinzufügen
        </button>
      </div>

      {error && <p className="text-xs text-[color:var(--status-critical)]">{error}</p>}

      {loading ? (
        <p className="text-xs text-muted-foreground py-8 text-center">Timeline wird geladen…</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Icon name="clock" className="w-5 h-5" />}
          title="Keine Einträge"
          description="Für diesen Filter sind noch keine Timeline-Ereignisse vorhanden."
        />
      ) : (
        <div className="rounded-lg border border-border bg-card divide-y divide-border">
          {filtered.map((ev) => (
            <div key={String(ev.id)} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusChip tone="neutral" className="text-[9px]">
                      {String(ev.type ?? ev.eventType ?? 'EVENT')}
                    </StatusChip>
                    <span className="text-xs font-semibold text-foreground">
                      {String(ev.title ?? 'Ereignis')}
                    </span>
                  </div>
                  {ev.description ? (
                    <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">
                      {String(ev.description)}
                    </p>
                  ) : null}
                  {ev.createdByName ? (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      von {String(ev.createdByName)}
                    </p>
                  ) : null}
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">
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
