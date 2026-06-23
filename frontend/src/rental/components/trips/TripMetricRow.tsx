import { getOperatorStressLabel } from './timeline.utils';
import type { TripTimelineTrip } from './timeline.types';
import { buildInstantLine, buildStatusLine, formatTripTime } from './timeline.utils';

interface TripMetricRowProps {
  trip: TripTimelineTrip;
}

export function TripMetricRow({ trip }: TripMetricRowProps) {
  const timeRange = `${formatTripTime(trip.startTime)} – ${trip.endTime ? formatTripTime(trip.endTime) : '…'}`;
  const stressLabel = getOperatorStressLabel(trip);
  const stressTone =
    stressLabel === 'Kritisch' || stressLabel === 'Auffällig'
      ? 'text-amber-600 dark:text-amber-400'
      : stressLabel === 'Beobachten'
        ? 'text-blue-600 dark:text-blue-400'
        : 'text-foreground/85';

  return (
    <div className="min-w-0 space-y-1">
      <p className="text-[13px] sm:text-[14px] font-semibold tabular-nums tracking-[-0.02em] text-foreground">
        {timeRange}
      </p>
      <p className="text-[11px] font-medium text-muted-foreground tabular-nums leading-snug">
        {buildInstantLine(trip)}
      </p>
      <p className={`text-[11px] font-semibold tabular-nums ${stressTone}`}>{buildStatusLine(trip)}</p>
    </div>
  );
}
