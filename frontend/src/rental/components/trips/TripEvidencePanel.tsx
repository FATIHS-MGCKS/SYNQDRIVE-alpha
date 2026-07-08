import type { ReactNode } from 'react';
import { TripStatusBadge } from './TripStatusBadge';
import { RENTAL_COPY } from './trips-view-ui';
import { assignmentLabel } from './utils/tripLabels';
import { formatTripDistance, formatTripDuration, formatTripTime } from './utils/tripFormatters';
import { getStressLabel, resolveDrivingStressScore, getStressLevel } from '../../lib/scoreFormat';
import {
  deriveDrivingBehaviorLabel,
  deriveReviewHintSummary,
  hasReviewHints,
  resolveGesamtbewertungDisplay,
} from './behavior-ui.utils';
import {
  deriveTripOverallRating,
  tripAssessmentToOverallRating,
  tripOverallRatingTone,
} from './utils/trip-overall-status';
import type { TripBehaviorEvent, TripTimelineTrip } from './timeline.types';
import type { TripRentalContextView } from './utils/tripRentalContext';
import { useAddress } from '../../../lib/useAddress';
import { Icon } from '../ui/Icon';
import {
  deriveTripAssessability,
  hasNativeBehaviorEvents,
} from './event-context-ui';

interface TripEvidencePanelProps {
  trip: TripTimelineTrip;
  rentalContext?: TripRentalContextView;
  behaviorEvents: TripBehaviorEvent[];
  routePointsCount: number;
  routeLoading: boolean;
  routeError: string | null;
}

function EvidenceRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/30 py-1.5 text-[11px] last:border-0">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <div className="min-w-0 text-right font-medium text-foreground">{children}</div>
    </div>
  );
}

function LocationValue({ lat, lng }: { lat?: number; lng?: number }) {
  const { address, loading } = useAddress(lat, lng);
  if (lat == null || lng == null) {
    return (
      <span className="font-normal text-muted-foreground">{RENTAL_COPY.evidenceUnavailable}</span>
    );
  }
  if (loading) {
    return (
      <Icon name="loader-2" className="inline-block h-3 w-3 animate-spin text-muted-foreground" />
    );
  }
  return (
    <span className="inline-block max-w-[200px] truncate align-bottom">
      {address?.formatted ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`}
    </span>
  );
}

function bookingRowLabel(rentalContext?: TripRentalContextView): string {
  if (rentalContext?.booking) {
    return `${rentalContext.booking.bookingNumber} · ${rentalContext.booking.customerName}`;
  }
  return RENTAL_COPY.noBookingLinked;
}

export function TripEvidencePanel({
  trip,
  rentalContext,
  behaviorEvents,
}: TripEvidencePanelProps) {
  const hasStart = trip.startLatitude != null && trip.startLongitude != null;
  const hasEnd = trip.endLatitude != null && trip.endLongitude != null;

  const assessability = deriveTripAssessability({
    enrichmentStatus: trip.behaviorEnrichmentStatus,
    detailsLimited: trip.detailsLimited,
    behaviorReady: trip.behaviorReady,
    hasNativeEvents: hasNativeBehaviorEvents(behaviorEvents),
    analysisAssessability: trip.analysisAssessability ?? null,
    shortTermMisuseAssessable: trip.shortTermMisuseAssessable,
  });

  const gesamtbewertung = resolveGesamtbewertungDisplay(trip, behaviorEvents, {
    assessable: assessability.assessable,
  });
  const overallRating = trip.tripAssessment
    ? tripAssessmentToOverallRating(trip.tripAssessment.status)
    : deriveTripOverallRating(trip, behaviorEvents);
  const drivingBehaviorLabel = deriveDrivingBehaviorLabel(behaviorEvents);
  const reviewHint = deriveReviewHintSummary(trip, behaviorEvents);
  const showReviewHints = hasReviewHints(trip, behaviorEvents);

  const stressScore = resolveDrivingStressScore(trip);
  const stressLabel =
    stressScore != null
      ? getStressLabel(trip.stressLevel ?? getStressLevel(stressScore) ?? undefined)
      : '—';

  return (
    <div className="h-full rounded-xl border border-border bg-card p-3.5">
      <p className="text-[12px] font-semibold text-foreground">{RENTAL_COPY.tripAnalysisTitle}</p>

      <div className="mt-3 rounded-lg border border-border/40 bg-card/70 px-3 py-2">
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
        <EvidenceRow label={RENTAL_COPY.evidenceOverallRating}>
          <TripStatusBadge
            label={gesamtbewertung.label}
            tone={tripOverallRatingTone(overallRating)}
          />
        </EvidenceRow>
        <EvidenceRow label={RENTAL_COPY.evidenceVehicleStress}>
          {stressLabel}
        </EvidenceRow>
        <EvidenceRow label={RENTAL_COPY.evidenceDrivingStyle}>
          {drivingBehaviorLabel}
        </EvidenceRow>
        {showReviewHints && (
          <EvidenceRow label={RENTAL_COPY.evidenceReviewHints}>
            <span className="text-amber-700 dark:text-amber-400">{reviewHint}</span>
          </EvidenceRow>
        )}
        <EvidenceRow label={RENTAL_COPY.evidenceAssignment}>{assignmentLabel(trip)}</EvidenceRow>
        <EvidenceRow label={RENTAL_COPY.evidenceBooking}>{bookingRowLabel(rentalContext)}</EvidenceRow>
      </div>
    </div>
  );
}
