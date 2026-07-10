import { LiquidGlassLens } from '../../../components/surface';
import { VehicleStressBadge } from '../VehicleStressPanel';
import { resolveDrivingStressScore } from '../../lib/scoreFormat';
import type { TripMapTripData } from './trips-map.types';
import {
  countTripEvents,
  formatTripDistance,
  formatTripDuration,
  formatTripTime,
  tripAssignmentLabel,
  tripStressStatusLabel,
} from './trips-map.utils';

interface TripMapSummaryOverlayProps {
  trip: TripMapTripData;
  isDark: boolean;
}

export function TripMapSummaryOverlay({ trip, isDark }: TripMapSummaryOverlayProps) {
  const timeRange = `${formatTripTime(trip.startTime)} – ${trip.endTime ? formatTripTime(trip.endTime) : '…'}`;
  const events = countTripEvents(trip);
  const assignment = tripAssignmentLabel(trip);
  const stressScore = resolveDrivingStressScore(trip);
  const isPrivate = trip.isPrivateTrip || trip.assignmentStatus === 'PRIVATE_UNASSIGNED';

  return (
    <div className="pointer-events-none absolute top-2.5 left-2.5 z-20 max-w-[min(18rem,calc(100%-5.5rem))]">
      <LiquidGlassLens
        variant="fleetPanel"
        renderMode="shell"
        intensity="subtle"
        className="pointer-events-auto w-full"
      >
        <div className="liquid-glass-lens__trip-panel">
          <p className="text-[12px] font-semibold tabular-nums tracking-[-0.02em] text-foreground">
            {timeRange}
          </p>
          <p className="mt-1 text-[10px] font-medium text-muted-foreground tabular-nums">
            {formatTripDistance(trip.distanceKm)}
            <span className="mx-1 opacity-40">·</span>
            {formatTripDuration(trip.durationMinutes)}
            {events != null && (
              <>
                <span className="mx-1 opacity-40">·</span>
                {events} {events === 1 ? 'Ereignis' : 'Ereignisse'}
              </>
            )}
            {events == null && trip.behaviorReady === false && (
              <>
                <span className="mx-1 opacity-40">·</span>
                Analyse läuft
              </>
            )}
          </p>
          {(assignment || isPrivate) && (
            <p className="mt-1.5 text-[10px] text-foreground/90 truncate">
              {isPrivate ? (
                <span className="font-medium text-purple-500 dark:text-purple-400">Privat</span>
              ) : (
                <>
                  <span className="text-muted-foreground">
                    {trip.assignmentSubjectType === 'BOOKING_CUSTOMER' ? 'Kunde' : 'Fahrer'}:
                  </span>{' '}
                  <span className="font-medium">{assignment}</span>
                </>
              )}
            </p>
          )}
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <VehicleStressBadge
              stressScore={stressScore}
              stressLevel={trip.stressLevel ?? null}
            />
            <span
              className={`text-[9px] font-semibold uppercase tracking-wider ${
                isDark ? 'text-muted-foreground' : 'text-muted-foreground'
              }`}
            >
              {tripStressStatusLabel(trip)}
            </span>
            {trip.tripStatus === 'ONGOING' && (
              <LiquidGlassLens variant="statusPill" renderMode="lens" intensity="subtle">
                <span className="liquid-glass-lens__hud-badge liquid-glass-lens__hud-badge--watch">
                  <span className="liquid-glass-lens__hud-badge-dot" aria-hidden="true" />
                  Aktiv
                </span>
              </LiquidGlassLens>
            )}
          </div>
        </div>
      </LiquidGlassLens>
    </div>
  );
}
