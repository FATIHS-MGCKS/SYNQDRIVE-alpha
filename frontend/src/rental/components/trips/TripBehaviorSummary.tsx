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
import { formatBehaviorEventCountLabel } from './trip-assessment-copy';
import { TripBehaviorCategoryBars } from './TripBehaviorCategoryBars';

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
    analysisAssessability: trip.analysisAssessability ?? null,
    shortTermMisuseAssessable: trip.shortTermMisuseAssessable,
  });

  const overall = trip.tripAssessment
    ? null
    : deriveBehaviorOverallStatus(trip, events, {
        assessable: assessability.assessable,
      });
  const eventCountLabel = formatBehaviorEventCountLabel(events, trip);
  const criticalCount = countCriticalEvents(events);
  const severest = findSeverestEvent(events);

  const title = trip.tripAssessment?.label ?? (overall ? BEHAVIOR_STATUS_LABEL[overall] : '—');
  const primaryReason = trip.tripAssessment?.primaryReason ?? null;
  const severestLabel = severest ? eventTypeLabel(severest) : null;
  const showSeverest = !trip.tripAssessment && severestLabel != null && severestLabel !== title;

  const metaParts = [
    eventCountLabel,
    criticalCount > 0 ? `${criticalCount} kritisch` : null,
  ].filter(Boolean);

  const isNotAssessable =
    trip.tripAssessment?.status === 'NICHT_BEWERTBAR' || overall === 'not_assessable';

  return (
    <div
      className={`rounded-xl border px-3.5 py-3 space-y-3 ${
        isNotAssessable
          ? 'border-amber-500/30 bg-amber-500/5'
          : 'border-border/60 bg-muted/20'
      }`}
    >
      <div className="space-y-1">
        <p className="text-[13px] font-semibold tracking-[-0.02em] text-foreground">{title}</p>
        {primaryReason ? (
          <p className="text-[11px] text-muted-foreground">{primaryReason}</p>
        ) : (
          <p className="text-[11px] tabular-nums text-muted-foreground">{metaParts.join(' · ')}</p>
        )}

        {isNotAssessable ? (
          <div className="space-y-0.5">
            <p className="text-[10px] text-amber-700 dark:text-amber-400">{assessability.note}</p>
          </div>
        ) : (
          showSeverest && (
            <p className="text-[10px] text-muted-foreground">
              Schwerstes Ereignis:{' '}
              <span className="font-medium text-foreground">{severestLabel}</span>
            </p>
          )
        )}
      </div>

      {events.length > 0 && <TripBehaviorCategoryBars events={events} />}
    </div>
  );
}
