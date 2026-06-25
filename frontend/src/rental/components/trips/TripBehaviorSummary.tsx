import type { TripBehaviorEvent } from './timeline.types';
import type { TripTimelineTrip } from './timeline.types';
import {
  BEHAVIOR_STATUS_LABEL,
  countCriticalEvents,
  deriveBehaviorOverallStatus,
  findSeverestEvent,
  eventTypeLabel,
} from './behavior-ui.utils';
import { countTripEvents } from './trips-map.utils';

interface TripBehaviorSummaryProps {
  trip: TripTimelineTrip;
  events: TripBehaviorEvent[];
}

export function TripBehaviorSummary({ trip, events }: TripBehaviorSummaryProps) {
  const overall = deriveBehaviorOverallStatus(trip, events);
  const eventCount = countTripEvents(trip) ?? events.length;
  const criticalCount = countCriticalEvents(events);
  const severest = findSeverestEvent(events);

  const title = BEHAVIOR_STATUS_LABEL[overall];
  // Only show the severest event as a subline when it adds specificity beyond
  // the headline (e.g. "Kaltmotor-Missbrauch" vs. generic "Missbrauchsverdacht").
  const severestLabel = severest ? eventTypeLabel(severest) : null;
  const showSeverest = severestLabel != null && severestLabel !== title;

  const metaParts = [
    `${eventCount} ${eventCount === 1 ? 'Ereignis' : 'Ereignisse'}`,
    criticalCount > 0 ? `${criticalCount} kritisch` : null,
  ].filter(Boolean);

  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 px-3.5 py-3 space-y-1.5">
      <p className="text-[13px] font-semibold tracking-[-0.02em] text-foreground">{title}</p>
      <p className="text-[11px] text-muted-foreground tabular-nums">{metaParts.join(' · ')}</p>
      {showSeverest && (
        <p className="text-[10px] text-muted-foreground">
          Schwerstes Ereignis: <span className="font-medium text-foreground">{severestLabel}</span>
        </p>
      )}
    </div>
  );
}
