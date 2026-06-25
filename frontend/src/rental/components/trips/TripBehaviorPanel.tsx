import type { TripBehaviorEvent } from './timeline.types';
import type { TripTimelineTrip } from './timeline.types';
import { TripBehaviorEmptyState } from './TripBehaviorEmptyState';
import { TripBehaviorEventList } from './TripBehaviorEventList';
import { TripBehaviorSummary } from './TripBehaviorSummary';

export interface TripBehaviorPanelProps {
  trip: TripTimelineTrip;
  isDark: boolean;
  events: TripBehaviorEvent[];
  loading: boolean;
  selectedEventId: string | null;
  onSelectEvent: (event: TripBehaviorEvent) => void;
  onShowEventOnMap: (event: TripBehaviorEvent) => void;
  onEnrich: () => void;
}

export function TripBehaviorPanel({
  trip,
  isDark,
  events,
  loading,
  selectedEventId,
  onSelectEvent,
  onShowEventOnMap,
  onEnrich,
}: TripBehaviorPanelProps) {
  const enrichStatus = trip.behaviorEnrichmentStatus;
  const behaviorIsReady = trip.behaviorReady ?? !!trip.behaviorEnrichedAt;

  if (loading || enrichStatus === 'PENDING') {
    return <TripBehaviorEmptyState variant="pending" isDark={isDark} />;
  }

  if (enrichStatus === 'IN_PROGRESS') {
    return <TripBehaviorEmptyState variant="running" isDark={isDark} />;
  }

  if (enrichStatus === 'SKIPPED_NO_HF_DATA') {
    return <TripBehaviorEmptyState variant="skipped" isDark={isDark} />;
  }

  if (enrichStatus === 'FAILED_PERMANENT') {
    return <TripBehaviorEmptyState variant="failed_permanent" isDark={isDark} />;
  }

  if (enrichStatus === 'FAILED_TRANSIENT') {
    return <TripBehaviorEmptyState variant="failed_retry" isDark={isDark} onRetry={onEnrich} />;
  }

  if (!behaviorIsReady) {
    return <TripBehaviorEmptyState variant="not_started" isDark={isDark} onAnalyze={onEnrich} />;
  }

  if (trip.detailsLimited && events.length === 0) {
    return (
      <div className="space-y-3">
        <TripBehaviorEmptyState variant="limited" isDark={isDark} />
        <TripBehaviorSummary trip={trip} events={events} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <TripBehaviorSummary trip={trip} events={events} />

      {events.length === 0 ? (
        <TripBehaviorEmptyState variant="success_empty" isDark={isDark} />
      ) : (
        <TripBehaviorEventList
          events={events}
          selectedEventId={selectedEventId}
          onSelectEvent={onSelectEvent}
          onShowOnMap={onShowEventOnMap}
        />
      )}
    </div>
  );
}
