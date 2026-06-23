import { useMemo, useState } from 'react';
import { Icon } from '../ui/Icon';
import type { TripBehaviorEvent, TripEnrichment } from './timeline.types';
import type { TripTimelineTrip } from './timeline.types';
import { TripBehaviorEmptyState } from './TripBehaviorEmptyState';
import { TripBehaviorEventList } from './TripBehaviorEventList';
import { TripBehaviorSummary } from './TripBehaviorSummary';
import { BEHAVIOR_COPY, tv } from './trips-view-ui';
import { enrichmentStatusLabel } from './behavior-ui.utils';

export interface TripBehaviorPanelProps {
  trip: TripTimelineTrip;
  isDark: boolean;
  events: TripBehaviorEvent[];
  loading: boolean;
  enrichment?: TripEnrichment;
  selectedEventId: string | null;
  onSelectEvent: (event: TripBehaviorEvent) => void;
  onShowEventOnMap: (event: TripBehaviorEvent) => void;
  onEnrich: () => void;
}

function sumMetadataSampleCount(events: TripBehaviorEvent[]): number | null {
  let total = 0;
  let found = false;
  for (const ev of events) {
    const count = ev.metadataJson?.sampleCount;
    if (typeof count === 'number') {
      total += count;
      found = true;
    }
  }
  return found ? total : null;
}

export function TripBehaviorPanel({
  trip,
  isDark,
  events,
  loading,
  enrichment,
  selectedEventId,
  onSelectEvent,
  onShowEventOnMap,
  onEnrich,
}: TripBehaviorPanelProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const enrichStatus = trip.behaviorEnrichmentStatus;
  const behaviorIsReady = trip.behaviorReady ?? !!trip.behaviorEnrichedAt;

  const geoEventCount = useMemo(
    () => events.filter((e) => e.latitude != null && e.longitude != null).length,
    [events],
  );
  const hfSampleTotal = useMemo(() => sumMetadataSampleCount(events), [events]);
  const attempts = (trip as { behaviorEnrichmentAttempts?: number }).behaviorEnrichmentAttempts;

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

      <div className="rounded-xl border border-border/40 overflow-hidden">
        <button
          type="button"
          onClick={() => setDetailsOpen((o) => !o)}
          className={`${tv.focusRing} w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/30 transition-colors`}
        >
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            {BEHAVIOR_COPY.technicalDetails}
          </span>
          <Icon name={detailsOpen ? 'chevron-up' : 'chevron-down'} className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
        {detailsOpen && (
          <div className="px-3 pb-3 pt-0 space-y-1.5 border-t border-border/30">
            {hfSampleTotal != null && (
              <DetailRow label={BEHAVIOR_COPY.hfDataPoints} value={String(hfSampleTotal)} />
            )}
            <DetailRow label={BEHAVIOR_COPY.gpsEventPositions} value={String(geoEventCount)} />
            {trip.behaviorEnrichedAt && (
              <DetailRow
                label={BEHAVIOR_COPY.analysisWindow}
                value={new Date(trip.behaviorEnrichedAt).toLocaleString('de-DE')}
              />
            )}
            {enrichment?.mapMatchConfidence != null && enrichment.mapMatchConfidence > 0 && (
              <DetailRow
                label={BEHAVIOR_COPY.routeMatchStatus}
                value={`${Math.round(enrichment.mapMatchConfidence * 100)} %`}
              />
            )}
            {enrichment?.enrichedAt && (
              <DetailRow
                label="Routen-Anreicherung"
                value={new Date(enrichment.enrichedAt).toLocaleString('de-DE')}
              />
            )}
            {attempts != null && attempts > 0 && (
              <DetailRow label={BEHAVIOR_COPY.enrichmentAttempts} value={String(attempts)} />
            )}
            {enrichmentStatusLabel(enrichStatus) && (
              <DetailRow label="Analysestatus (intern)" value={enrichmentStatusLabel(enrichStatus)!} />
            )}
            {trip.detailsLimited && (
              <p className="text-[10px] text-muted-foreground pt-1">{BEHAVIOR_COPY.limitedHint}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[10px] pt-2 first:pt-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground tabular-nums text-right">{value}</span>
    </div>
  );
}
