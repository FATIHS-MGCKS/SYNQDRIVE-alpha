import type { ReactNode } from 'react';
import { Icon } from '../ui/Icon';
import { useAddress } from '../../../lib/useAddress';
import { TripStatusBadge } from './TripStatusBadge';
import { RENTAL_COPY } from './trips-view-ui';
import { assignmentLabel, routeStatusLabel } from './utils/tripLabels';
import { formatTripDistance, formatTripDuration, formatTripTime } from './utils/tripFormatters';
import { getOperatorStressLabel, hasAbuseSuspicion } from './utils/tripStatus';
import type { TripEnrichment, TripBehaviorEvent, TripTimelineTrip } from './timeline.types';
import type { TripRentalContextView } from './utils/tripRentalContext';

interface TripEvidencePanelProps {
  trip: TripTimelineTrip;
  rentalContext?: TripRentalContextView;
  behaviorEvents: TripBehaviorEvent[];
  enrichment?: TripEnrichment;
  routePointsCount: number;
  routeLoading: boolean;
  routeError: string | null;
}

function EvidenceRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-[11px] py-1 border-b border-border/30 last:border-0">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <div className="text-right font-medium text-foreground min-w-0">{children}</div>
    </div>
  );
}

function LocationValue({
  lat,
  lng,
}: {
  lat?: number;
  lng?: number;
}) {
  const { address, loading } = useAddress(lat, lng);
  if (lat == null || lng == null) {
    return <span className="text-muted-foreground font-normal">{RENTAL_COPY.evidenceUnavailable}</span>;
  }
  if (loading) {
    return <Icon name="loader-2" className="inline-block w-3 h-3 animate-spin text-muted-foreground" />;
  }
  return (
    <span className="truncate inline-block max-w-[180px] align-bottom">
      {address?.formatted ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`}
    </span>
  );
}

export function TripEvidencePanel({
  trip,
  rentalContext,
  behaviorEvents,
  enrichment,
  routePointsCount,
  routeLoading,
  routeError,
}: TripEvidencePanelProps) {
  const flagged = hasAbuseSuspicion(trip);
  const gpsEvents = behaviorEvents.filter((e) => e.latitude != null && e.longitude != null).length;
  const hfLimited =
    trip.behaviorEnrichmentStatus === 'SKIPPED_NO_HF_DATA' || trip.detailsLimited;
  const hfReady = trip.behaviorReady === true;
  const mapMatch = enrichment?.mapMatchConfidence ?? 0;
  const hasStart = trip.startLatitude != null && trip.startLongitude != null;
  const hasEnd = trip.endLatitude != null && trip.endLongitude != null;

  return (
    <div
      className={`rounded-xl border p-3.5 space-y-3 ${
        flagged ? 'border-amber-500/20 bg-amber-500/[0.04]' : 'border-border bg-card'
      }`}
    >
      <div className="flex items-start gap-2">
        <Icon
          name={flagged ? 'shield-alert' : 'clipboard-list'}
          className={`w-4 h-4 shrink-0 mt-0.5 ${
            flagged ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
          }`}
        />
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-foreground">{RENTAL_COPY.evidenceSummaryTitle}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
            {flagged ? RENTAL_COPY.evidenceNotableHint : RENTAL_COPY.evidenceSummaryHint}
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border/40 bg-card/70 px-3 py-2">
        <EvidenceRow label={RENTAL_COPY.evidenceTime}>
          <span className="tabular-nums">
            {formatTripTime(trip.startTime)}
            {trip.endTime ? ` – ${formatTripTime(trip.endTime)}` : ''}
          </span>
        </EvidenceRow>
        <EvidenceRow label={RENTAL_COPY.evidenceDistance}>
          {formatTripDistance(trip.distanceKm)} · {formatTripDuration(trip.durationMinutes)}
        </EvidenceRow>
        {(hasStart || hasEnd) && (
          <>
            <EvidenceRow label={RENTAL_COPY.evidenceStart}>
              <LocationValue lat={trip.startLatitude} lng={trip.startLongitude} />
            </EvidenceRow>
            <EvidenceRow label={RENTAL_COPY.evidenceDestination}>
              <LocationValue lat={trip.endLatitude} lng={trip.endLongitude} />
            </EvidenceRow>
          </>
        )}
        <EvidenceRow label={RENTAL_COPY.evidenceStress}>
          <TripStatusBadge
            label={getOperatorStressLabel(trip)}
            tone={flagged ? 'critical' : 'watch'}
          />
        </EvidenceRow>
        <EvidenceRow label={RENTAL_COPY.evidenceEvents}>
          {behaviorEvents.length > 0
            ? `${behaviorEvents.length} Belastungsereignisse · ${gpsEvents} mit Position`
            : '—'}
        </EvidenceRow>
        <EvidenceRow label={RENTAL_COPY.evidenceAssignment}>{assignmentLabel(trip)}</EvidenceRow>
        {rentalContext?.booking && (
          <EvidenceRow label={RENTAL_COPY.evidenceBooking}>
            {rentalContext.booking.bookingNumber} · {rentalContext.booking.customerName}
          </EvidenceRow>
        )}
        <EvidenceRow label={RENTAL_COPY.evidenceRoute}>
          {routeStatusLabel(routeLoading, routeError, routePointsCount)}
        </EvidenceRow>
        <EvidenceRow label={RENTAL_COPY.evidenceDataQuality}>
          {hfLimited ? RENTAL_COPY.hfLimited : hfReady ? RENTAL_COPY.hfAvailable : RENTAL_COPY.hfPending}
          {mapMatch > 0 && (
            <span className="block text-[10px] text-muted-foreground font-normal mt-0.5">
              {RENTAL_COPY.routeMatch} {Math.round(mapMatch * 100)}%
            </span>
          )}
        </EvidenceRow>
      </div>

      {flagged && (
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          {RENTAL_COPY.damageNeutralHint}
        </p>
      )}
    </div>
  );
}
