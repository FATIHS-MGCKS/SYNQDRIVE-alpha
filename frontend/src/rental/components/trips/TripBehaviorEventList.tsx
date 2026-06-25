import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../ui/Icon';
import type { TripBehaviorEvent } from './timeline.types';
import {
  classificationToSeverity,
  eventExplanation,
  eventTypeLabel,
  formatBehaviorTime,
  formatEventEvidence,
  sortBehaviorEvents,
} from './behavior-ui.utils';
import { BEHAVIOR_COPY, tv } from './trips-view-ui';
import { TripEventSeverityBadge } from './TripEventSeverityBadge';

type CategoryFilter = 'all' | 'ACCELERATION' | 'BRAKING' | 'ABUSE';

const CONFIDENCE_LABEL: Record<string, string> = {
  low: 'niedrig',
  medium: 'mittel',
  high: 'hoch',
};

/**
 * Phase 4 — shows whether an event is a native DIMO event ("Nativ") or an
 * HF-reconstructed event ("Rekonstruiert"), with reconstruction confidence.
 * Native events render no extra noise unless provenance is known.
 */
function ProvenanceBadge({ event }: { event: TripBehaviorEvent }) {
  if (!event.provenance) return null;
  const isNative = event.provenance === 'NATIVE';
  const confidence = event.confidence ? CONFIDENCE_LABEL[event.confidence] ?? event.confidence : null;
  return (
    <span
      title={
        isNative
          ? 'Natives DIMO-Ereignis (Telemetry API)'
          : `Aus 1s-Hochfrequenzdaten rekonstruiert${confidence ? ` · Konfidenz ${confidence}` : ''}`
      }
      className={`rounded-full border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide ${
        isNative
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
          : 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
      }`}
    >
      {isNative ? 'Nativ' : 'Rekonstruiert'}
      {!isNative && confidence ? ` · ${confidence}` : ''}
    </span>
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
  const [filter, setFilter] = useState<CategoryFilter>('all');
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = useMemo(() => {
    const sorted = sortBehaviorEvents(events);
    if (filter === 'all') return sorted;
    return sorted.filter((e) => e.eventCategory === filter);
  }, [events, filter]);

  useEffect(() => {
    if (!selectedEventId || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-event-id="${selectedEventId}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedEventId]);

  const filters: { key: CategoryFilter; label: string }[] = [
    { key: 'all', label: 'Alle' },
    { key: 'BRAKING', label: 'Bremsen' },
    { key: 'ACCELERATION', label: 'Beschleunigung' },
    { key: 'ABUSE', label: 'Missbrauch' },
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

      <ul ref={listRef} className="space-y-1.5 max-h-[min(360px,50vh)] overflow-y-auto pr-0.5">
        {filtered.map((ev) => {
          const isSelected = selectedEventId === ev.id;
          const hasMapPosition = ev.latitude != null && ev.longitude != null;
          const severity = classificationToSeverity(ev.classification, ev.eventCategory);
          const evidence = formatEventEvidence(ev);

          return (
            <li key={ev.id} data-event-id={ev.id}>
              <div
                className={`rounded-xl border px-3 py-2.5 transition-colors ${
                  isSelected
                    ? 'border-[color:var(--brand)]/35 bg-[color:color-mix(in_srgb,var(--brand)_6%,var(--card))] ring-1 ring-[color:var(--brand)]/10'
                    : 'border-border/60 bg-card/50 hover:bg-card'
                }`}
              >
                <button
                  type="button"
                  className={`${tv.focusRing} w-full text-left`}
                  onClick={() => onSelectEvent(ev)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="text-[11px] font-semibold text-foreground">
                          {eventTypeLabel(ev)}
                        </span>
                        <TripEventSeverityBadge level={severity} />
                        <ProvenanceBadge event={ev} />
                      </div>
                      <p className="text-[10px] text-muted-foreground tabular-nums">
                        {formatBehaviorTime(ev.startedAt)}
                        {ev.startSpeedKmh != null && (
                          <>
                            <span className="mx-1 opacity-40">·</span>
                            {Math.round(ev.startSpeedKmh)}
                            {ev.endSpeedKmh != null ? ` → ${Math.round(ev.endSpeedKmh)}` : ''} km/h
                          </>
                        )}
                      </p>
                      <p className="mt-1 text-[10px] text-muted-foreground leading-snug line-clamp-2">
                        {eventExplanation(ev)}
                      </p>
                      {evidence.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                          {evidence.map((item) => (
                            <span
                              key={item.label}
                              className="text-[10px] text-muted-foreground tabular-nums"
                            >
                              {item.label}:{' '}
                              <span className="font-medium text-foreground">{item.value}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
                {hasMapPosition && (
                  <button
                    type="button"
                    onClick={() => onShowOnMap(ev)}
                    className={`${tv.focusRing} mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-[color:var(--brand)] hover:underline`}
                  >
                    <Icon name="map-pin" className="w-3 h-3" />
                    {BEHAVIOR_COPY.showOnMap}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {filtered.length === 0 && (
        <p className="text-[11px] text-muted-foreground py-2">{BEHAVIOR_COPY.noEventsInFilter}</p>
      )}
    </div>
  );
}
