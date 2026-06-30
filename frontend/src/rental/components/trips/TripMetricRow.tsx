import { TripAssignmentBadge } from './TripAssignmentBadge';
import { TripStatusBadge } from './TripStatusBadge';
import type { TripBehaviorEvent, TripTimelineTrip } from './timeline.types';
import { buildInstantLine, formatTripTime } from './timeline.utils';
import { hasTripDeviceConnectionAlert } from './timeline.utils';
import {
  deriveTripOverallRating,
  TRIP_OVERALL_RATING_LABEL,
  tripOverallRatingTone,
} from './utils/trip-overall-status';

interface TripMetricRowProps {
  trip: TripTimelineTrip;
  dayTripNumber?: number;
  behaviorEvents?: TripBehaviorEvent[];
}

export function TripMetricRow({
  trip,
  dayTripNumber,
  behaviorEvents = [],
}: TripMetricRowProps) {
  const timeRange = `${formatTripTime(trip.startTime)} – ${trip.endTime ? formatTripTime(trip.endTime) : '…'}`;
  const overallRating = deriveTripOverallRating(trip, behaviorEvents);
  const deviceAlert = hasTripDeviceConnectionAlert(trip);

  return (
    <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
      <div className="min-w-0 space-y-0.5">
        {dayTripNumber != null && (
          <p className="text-[11px] font-semibold tracking-[-0.02em] text-muted-foreground">
            Fahrt {dayTripNumber}
          </p>
        )}
        <p className="text-[13px] font-semibold tabular-nums tracking-[-0.02em] text-foreground sm:text-[14px]">
          {timeRange}
        </p>
        <p className="text-[11px] font-medium tabular-nums leading-snug text-muted-foreground">
          {buildInstantLine(trip)}
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-start justify-end gap-1 pt-0.5">
        <TripAssignmentBadge trip={trip} />
        <TripStatusBadge
          label={TRIP_OVERALL_RATING_LABEL[overallRating]}
          tone={tripOverallRatingTone(overallRating)}
        />
        {deviceAlert && (
          <TripStatusBadge
            label={
              trip.deviceConnectionRentalRelevant ? 'Telematik abgezogen' : 'OBD getrennt'
            }
            tone={trip.hasOpenDeviceUnplug || trip.deviceConnectionRentalRelevant ? 'critical' : 'watch'}
          />
        )}
      </div>
    </div>
  );
}
