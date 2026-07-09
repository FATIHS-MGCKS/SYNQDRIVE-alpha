import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../ui/Icon';
import type { TripBehaviorEvent } from './timeline.types';
import {
  classificationToSeverity,
  eventExplanation,
  eventTypeLabel,
  formatBehaviorTime,
  sortBehaviorEvents,
} from './behavior-ui.utils';
import {
  BEHAVIOR_CATEGORY_ORDER,
  eventMatchesCategoryFilter,
  type BehaviorCategoryFilter,
} from './behavior-category.utils';
import { BEHAVIOR_COPY, tv } from './trips-view-ui';
import { TripEventSeverityBadge } from './TripEventSeverityBadge';
import { TripEventMetricsGrid, TripEventUncertaintyBadges } from './TripEventMetricsGrid';
import { useAddress } from '../../../lib/useAddress';

const CONFIDENCE_LABEL: Record<string, string> = {
  low: 'niedrig',
  medium: 'mittel',
  high: 'hoch',
};

function ProvenanceBadge({ event }: { event: TripBehaviorEvent }) {
  if (!event.provenance) return null;
  const isNative = event.provenance === 'NATIVE';
  const confidence = event.confidence ? CONFIDENCE_LABEL[event.confidence] ?? event.confidence : null;
  if (!isNative) {
    return (
      <span
        title={`Aus 1s-Hochfrequenzdaten rekonstruiert${confidence ? ` · Konfidenz ${confidence}` : ''}`}
        className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400"
      >
        Rekonstruiert{confidence ? ` · ${confidence}` : ''}
      </span>
    );
  }
  return (
    <span
      title={
        event.originalEventName
          ? `Natives DIMO-Ereignis · ${event.originalEventName}`
          : 'Natives DIMO-Ereignis'
      }
      className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400"
    >
      Nativ
    </span>
  );
}

function EventPositionLine({ event }: { event: TripBehaviorEvent }) {
  const { address, loading } = useAddress(event.latitude ?? undefined, event.longitude ?? undefined);
  if (event.latitude == null || event.longitude == null) return null;

  const label = loading
    ? 'Position wird geladen…'
    : address?.formatted ?? `${event.latitude.toFixed(4)}, ${event.longitude.toFixed(4)}`;

  return (
    <>
      <span className="mx-1 opacity-40">·</span>
      <span className="truncate">{label}</span>
    </>
  );
}

interface TripBehaviorEventListProps {
  events: TripBehaviorEvent[];
  selectedEventId: string | null;
  onSelectEvent: (event: TripBehaviorEvent) => void;
  onShowOnMap: (event: TripBehaviorEvent) => void;
}

export function TripBehaviorEventList({
  events,
  selectedEventId,
  onSelectEvent,
  onShowOnMap,
}: TripBehaviorEventListProps) {
  const [filter, setFilter] = useState<BehaviorCategoryFilter>('all');
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = useMemo(() => {
    const sorted = sortBehaviorEvents(events);
    if (filter === 'all') return sorted;
    return sorted.filter((event) => eventMatchesCategoryFilter(event, filter));
  }, [events, filter]);

  useEffect(() => {
    if (!selectedEventId || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-event-id="${selectedEventId}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedEventId]);

  const filters: { key: BehaviorCategoryFilter; label: string }[] = [
    { key: 'all', label: 'Alle' },
    ...BEHAVIOR_CATEGORY_ORDER.map(({ key, label }) => ({ key, label })),
  ];

  if (!events.length) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`${tv.focusRing} rounded-full border px-2 py-0.5 text-[9px] font-semibold transition-colors ${
              filter === f.key
                ? 'border-[color:var(--brand)]/30 bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]'
                : 'border-border/60 bg-transparent text-muted-foreground hover:bg-muted/50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <ul ref={listRef} className="max-h-[min(360px,50vh)] space-y-1.5 overflow-y-auto pr-0.5">
        {filtered.map((ev) => {
          const isSelected = selectedEventId === ev.id;
          const hasMapPosition = ev.latitude != null && ev.longitude != null;
          const severity = classificationToSeverity(ev.classification, ev.eventCategory);
          const showSeverityBadge = severity === 'notable' || severity === 'critical' || severity === 'abuse';

          return (
            <li key={ev.id} data-event-id={ev.id}>
              <div
                className={`rounded-xl border px-3 py-2.5 transition-colors ${
                  isSelected
                    ? 'border-[color:var(--brand)]/35 bg-[color:color-mix(in_srgb,var(--brand)_6%,var(--card))] ring-1 ring-[color:var(--brand)]/10'
                    : 'border-border/60 surface-premium hover:surface-premium'
                }`}
              >
                <button
                  type="button"
                  className={`${tv.focusRing} w-full text-left`}
                  onClick={() => onSelectEvent(ev)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-foreground">
                          {eventTypeLabel(ev)}
                        </span>
                        {showSeverityBadge && <TripEventSeverityBadge level={severity} />}
                        <ProvenanceBadge event={ev} />
                        <TripEventUncertaintyBadges event={ev} />
                      </div>
                      <p className="text-[10px] tabular-nums text-muted-foreground">
                        {formatBehaviorTime(ev.startedAt)}
                        {ev.startSpeedKmh != null && (
                          <>
                            <span className="mx-1 opacity-40">·</span>
                            {Math.round(ev.startSpeedKmh)}
                            {ev.endSpeedKmh != null ? ` → ${Math.round(ev.endSpeedKmh)}` : ''} km/h
                          </>
                        )}
                        <EventPositionLine event={ev} />
                      </p>
                      <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-muted-foreground">
                        {eventExplanation(ev)}
                      </p>
                      <TripEventMetricsGrid event={ev} />
                    </div>
                  </div>
                </button>
                {hasMapPosition && (
                  <button
                    type="button"
                    onClick={() => onShowOnMap(ev)}
                    className={`${tv.focusRing} mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-[color:var(--brand)] hover:underline`}
                  >
                    <Icon name="map-pin" className="h-3 w-3" />
                    {BEHAVIOR_COPY.showOnMap}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {filtered.length === 0 && (
        <p className="py-2 text-[11px] text-muted-foreground">{BEHAVIOR_COPY.noEventsInFilter}</p>
      )}
    </div>
  );
}
