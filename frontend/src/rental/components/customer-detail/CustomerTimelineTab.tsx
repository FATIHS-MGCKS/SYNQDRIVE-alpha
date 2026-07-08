import { useMemo, useState } from 'react';
import { Clock, Loader2, Plus } from 'lucide-react';

import { Button } from '../../../components/ui/button';
import { cn } from '../../../components/ui/utils';
import { EmptyState, StatusChip } from '../../../components/patterns';
import { dotClassForTone } from '../../../components/patterns/status-utils';
import {
  mapTimelineEventToUserEntry,
  timelineEventMatchesFilter,
  type TimelineFilterCategory,
} from './customerDetailUtils';
import { cdv } from './customer-detail-ui';

type TimelineFilter = 'all' | TimelineFilterCategory;

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

  const filtered = useMemo(
    () => events.filter((ev) => timelineEventMatchesFilter(ev, filter)),
    [events, filter],
  );

  const entries = useMemo(
    () => filtered.map((ev, idx) => ({ id: String(ev.id ?? `timeline-${idx}`), entry: mapTimelineEventToUserEntry(ev) })),
    [filtered],
  );

  return (
    <div className={cdv.timelineToolbar}>
      <div className={cdv.timelineToolbarRow}>
        <div className={cdv.timelineFilterBar}>
          <div className={cdv.timelineFilterScroll} role="tablist" aria-label="Timeline-Filter">
            {FILTER_OPTIONS.map((option) => {
              const active = filter === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={cn(
                    cdv.timelineFilterButton,
                    active ? cdv.timelineFilterButtonActive : cdv.timelineFilterButtonIdle,
                  )}
                  onClick={() => setFilter(option.value)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="neutral"
          className={cn('gap-1.5', cdv.timelineAddNoteButton)}
          onClick={onAddNote}
        >
          <Plus className="size-3.5" aria-hidden />
          Notiz hinzufügen
        </Button>
      </div>

      {error ? <p className={cdv.timelineError}>Timeline konnte nicht geladen werden.</p> : null}

      {loading ? (
        <div className={cdv.timelineLoading}>
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Timeline wird geladen…
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Clock className="size-5" />}
          title="Keine Einträge"
          description="Für diesen Filter sind noch keine Einträge vorhanden."
        />
      ) : (
        <div className={cdv.timelineList}>
          <ol className={cdv.timelineEntryList}>
            {entries.map(({ id, entry }, index) => {
              const last = index === entries.length - 1;
              return (
                <li key={id} className={cdv.timelineEntryRow}>
                  <div className={cdv.timelineEntryRail}>
                    <span className={cdv.timelineEntryDotWrap}>
                      <span
                        className={cn('sq-dot h-2.5 w-2.5', dotClassForTone(entry.tone))}
                        aria-hidden
                      />
                    </span>
                    {!last ? <span className={cdv.timelineEntryLine} aria-hidden /> : null}
                  </div>
                  <div className={cdv.timelineEntryBody}>
                    <div className={cdv.timelineEntryHeader}>
                      <StatusChip tone={entry.tone} className="text-[10px]">
                        {entry.userTypeLabel}
                      </StatusChip>
                      <time className={cdv.timelineEntryTime} dateTime={String(filtered[index]?.createdAt ?? '')}>
                        {entry.formattedTimestamp}
                      </time>
                    </div>
                    <p className={cdv.timelineEntryTitle}>{entry.userTitle}</p>
                    {entry.userDescription ? (
                      <p className={cdv.timelineEntryDescription}>{entry.userDescription}</p>
                    ) : null}
                    {entry.createdByLabel ? (
                      <p className={cdv.timelineEntrySubline}>{entry.createdByLabel}</p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
