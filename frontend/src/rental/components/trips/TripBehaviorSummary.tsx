import type { TripBehaviorEvent } from './timeline.types';
import type { TripTimelineTrip } from './timeline.types';
import {
  BEHAVIOR_STATUS_LABEL,
  countCriticalEvents,
  deriveBehaviorOverallStatus,
  findSeverestEvent,
  eventTypeLabel,
} from './behavior-ui.utils';
import {
  deriveTripAssessability,
  hasNativeBehaviorEvents,
} from './event-context-ui';
import { countTripEvents } from './trips-map.utils';

interface TripBehaviorSummaryProps {
  trip: TripTimelineTrip;
  events: TripBehaviorEvent[];
}

export function TripBehaviorSummary({ trip, events }: TripBehaviorSummaryProps) {
  const hasNative = hasNativeBehaviorEvents(events);
  const assessability = deriveTripAssessability({
    enrichmentStatus: trip.behaviorEnrichmentStatus,
    detailsLimited: trip.detailsLimited,
    behaviorReady: trip.behaviorReady,
    hasNativeEvents: hasNative,
  });

  const overall = deriveBehaviorOverallStatus(trip, events, {
    assessable: assessability.assessable,
  });
  const eventCount = countTripEvents(trip) ?? events.length;
  const criticalCount = countCriticalEvents(events);
  const severest = findSeverestEvent(events);

  const title = BEHAVIOR_STATUS_LABEL[overall];
  const severestLabel = severest ? eventTypeLabel(severest) : null;
  const showSeverest = severestLabel != null && severestLabel !== title;

  const metaParts = [
    `${eventCount} ${eventCount === 1 ? 'Ereignis' : 'Ereignisse'}`,
    criticalCount > 0 ? `${criticalCount} kritisch` : null,
  ].filter(Boolean);

  const isNotAssessable = overall === 'not_assessable';

  return (
    <div
      className={`rounded-xl border px-3.5 py-3 space-y-1.5 ${
        isNotAssessable
          ? 'border-amber-500/30 bg-amber-500/5'
          : 'border-border/60 bg-muted/20'
      }`}
    >
      <p className="text-[13px] font-semibold tracking-[-0.02em] text-foreground">{title}</p>
      <p className="text-[11px] text-muted-foreground tabular-nums">{metaParts.join(' · ')}</p>

      {isNotAssessable ? (
        <div className="space-y-0.5">
          <p className="text-[10px] text-amber-700 dark:text-amber-400">
            {assessability.note}
          </p>
          <p className="text-[10px] text-muted-foreground">
            Native Events: {hasNative ? 'vorhanden' : 'keine'}
          </p>
        </div>
      ) : (
        showSeverest && (
          <p className="text-[10px] text-muted-foreground">
            Schwerstes Ereignis: <span className="font-medium text-foreground">{severestLabel}</span>
          </p>
        )
      )}
    </div>
  );
}
