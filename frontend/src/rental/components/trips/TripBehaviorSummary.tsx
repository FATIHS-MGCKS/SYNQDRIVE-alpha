import type { TripBehaviorEvent } from './timeline.types';
import type { TripTimelineTrip } from './timeline.types';
import {
  countCriticalEvents,
  deriveDrivingBehaviorLabel,
  eventTypeLabel,
  findSeverestEvent,
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
    analysisLimitReason: trip.analysisLimitReason ?? null,
    shortTermMisuseAssessable: trip.shortTermMisuseAssessable,
    deviceQualityWarning: trip.deviceQualityWarning,
  });

  const deviceQualityWarning = trip.deviceQualityWarning === true;

  const behaviorLabel = deriveDrivingBehaviorLabel(events);
  const eventCountLabel = formatBehaviorEventCountLabel(events, trip);
  const criticalCount = countCriticalEvents(events);
  const severest = findSeverestEvent(events);
  const severestLabel = severest ? eventTypeLabel(severest) : null;

  const isNotAssessable =
    trip.tripAssessment?.status === 'NICHT_BEWERTBAR' ||
    (events.length === 0 && assessability.assessable === false);

  return (
    <div
      className={`rounded-xl border px-3.5 py-3 space-y-3 ${
        isNotAssessable || deviceQualityWarning
          ? 'border-amber-500/30 bg-amber-500/5'
          : 'border-border/60 bg-muted/20'
      }`}
    >
      {deviceQualityWarning ? (
        <p className="text-[11px] font-medium text-amber-800 dark:text-amber-300">
          Fahrdaten eingeschränkt — Telematik-Gerät sendet unzuverlässige native Events
        </p>
      ) : null}
      <div className="space-y-1">
        <p className="text-[13px] font-semibold tracking-[-0.02em] text-foreground">{behaviorLabel}</p>
        <p className="text-[11px] tabular-nums text-muted-foreground">{eventCountLabel}</p>

        {isNotAssessable ? (
          <div className="space-y-0.5">
            <p className="text-[10px] text-amber-700 dark:text-amber-400">{assessability.note}</p>
          </div>
        ) : (
          severestLabel != null && (
            <p className="text-[10px] text-muted-foreground">
              Schwerstes Ereignis:{' '}
              <span className="font-medium text-foreground">{severestLabel}</span>
              {criticalCount > 0 ? ` · ${criticalCount} kritisch` : ''}
            </p>
          )
        )}
      </div>

      {events.length > 0 && <TripBehaviorCategoryBars events={events} />}
    </div>
  );
}
