import type { TripBehaviorEvent } from './timeline.types';
import type { TripTimelineTrip } from './timeline.types';
import {
  BEHAVIOR_STATUS_LABEL,
  countCriticalEvents,
  deriveBehaviorOverallStatus,
  findSeverestEvent,
  hfQualityLabel,
  eventTypeLabel,
} from './behavior-ui.utils';
import { countTripEvents } from './trips-map.utils';
import { TripEventSeverityBadge } from './TripEventSeverityBadge';
import { classificationToSeverity } from './behavior-ui.utils';

interface TripBehaviorSummaryProps {
  trip: TripTimelineTrip;
  events: TripBehaviorEvent[];
}

export function TripBehaviorSummary({ trip, events }: TripBehaviorSummaryProps) {
  const overall = deriveBehaviorOverallStatus(trip, events);
  const eventCount = countTripEvents(trip) ?? events.length;
  const criticalCount = countCriticalEvents(events);
  const severest = findSeverestEvent(events);
  const severestLevel = severest
    ? classificationToSeverity(severest.classification, severest.eventCategory)
    : 'neutral';

  const analyzedAt = trip.behaviorEnrichedAt
    ? new Date(trip.behaviorEnrichedAt).toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  const metaParts = [
    `${eventCount} ${eventCount === 1 ? 'Ereignis' : 'Ereignisse'}`,
    criticalCount > 0 ? `${criticalCount} kritisch` : null,
    hfQualityLabel(trip),
  ].filter(Boolean);

  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 px-3.5 py-3 space-y-2">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <p className="text-[13px] font-semibold tracking-[-0.02em] text-foreground">
            {BEHAVIOR_STATUS_LABEL[overall]}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
            {metaParts.join(' · ')}
          </p>
        </div>
        <TripEventSeverityBadge
          level={
            overall === 'abuse_suspect'
              ? 'abuse'
              : overall === 'critical'
                ? 'critical'
                : overall === 'notable'
                  ? 'notable'
                  : overall === 'watch'
                    ? 'watch'
                    : 'neutral'
          }
        />
      </div>
      {severest && (
        <p className="text-[10px] text-muted-foreground">
          Schwerstes Ereignis:{' '}
          <span className="font-medium text-foreground">{eventTypeLabel(severest)}</span>
          {' · '}
          <TripEventSeverityBadge level={severestLevel} className="inline-flex align-middle" />
        </p>
      )}
      {analyzedAt && (
        <p className="text-[9px] text-muted-foreground tabular-nums">Analysiert am {analyzedAt}</p>
      )}
    </div>
  );
}
