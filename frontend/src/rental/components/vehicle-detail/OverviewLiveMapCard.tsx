import { Icon } from '../ui/Icon';
import { LiquidGlassLens } from '../../../components/surface';
import { useShallow } from 'zustand/react/shallow';
import { LiveMapOverview } from '../LiveMapOverview';
import type { VehicleData } from '../../data/vehicles';
import { useVehicleLiveMapStore } from '../../stores/useVehicleLiveMapStore';
import {
  deriveOverviewMapPosition,
  type OverviewMapPositionMode,
} from '../../lib/overview-map-position';

export interface OverviewLiveMapCardProps {
  selectedVehicle: VehicleData | null;
  orgId: string;
  isDarkMode: boolean;
}

function trackingBadge(
  mode: OverviewMapPositionMode,
  isLiveTracking: boolean,
): { label: string; tone: 'live' | 'watch' | 'muted' } | null {
  switch (mode) {
    case 'livePosition':
      return { label: 'Live', tone: 'live' };
    case 'lastKnownPosition':
      return { label: 'Last known', tone: 'watch' };
    case 'staticPositionOnly':
      return { label: 'Last known', tone: 'watch' };
    case 'telemetryUnavailable':
      return { label: 'Signal issue', tone: 'muted' };
    case 'trackingUnavailable':
      return { label: 'No tracking', tone: 'muted' };
    case 'noPosition':
      return isLiveTracking ? { label: 'Acquiring', tone: 'watch' } : null;
    default:
      return null;
  }
}

export function OverviewLiveMapCard({
  selectedVehicle,
  orgId,
  isDarkMode,
}: OverviewLiveMapCardProps) {
  const liveTelemetry = useVehicleLiveMapStore(
    useShallow((state) => ({
      boundVehicleId: state.boundVehicleId,
      boundOrgId: state.boundOrgId,
      targetPosition: state.targetPosition,
      lastConfirmedPosition: state.lastConfirmedPosition,
      heading: state.heading,
      speedKmh: state.speedKmh,
      isLiveTracking: state.isLiveTracking,
      snapshot: state.snapshot,
      displayState: state.displayState,
      loading: state.loading,
      error: state.error,
      isFresh: state.isFresh,
      gpsSource: state.gpsSource,
    })),
  );

  const vehicleId = selectedVehicle?.id ?? null;
  const positionView = deriveOverviewMapPosition({
    boundVehicleId: liveTelemetry.boundVehicleId,
    boundOrgId: liveTelemetry.boundOrgId,
    vehicleId,
    orgId,
    targetPosition: liveTelemetry.targetPosition,
    lastConfirmedPosition: liveTelemetry.lastConfirmedPosition,
    staticLat: selectedVehicle?.lat,
    staticLng: selectedVehicle?.lng,
    loading: liveTelemetry.loading,
    error: liveTelemetry.error,
    isLiveTracking: liveTelemetry.isLiveTracking,
    isFresh: liveTelemetry.isFresh,
    gpsSource: liveTelemetry.gpsSource,
  });

  const hudSnapshot = positionView.isBoundToCurrentVehicle ? liveTelemetry.snapshot : null;
  const hudDisplayState = positionView.isBoundToCurrentVehicle ? liveTelemetry.displayState : 'PARKED';
  const statusBadge = trackingBadge(
    positionView.mode,
    positionView.isBoundToCurrentVehicle && liveTelemetry.isLiveTracking,
  );

  const stateColor =
    hudDisplayState === 'MOVING'
      ? 'text-[color:var(--status-positive)]'
      : hudDisplayState === 'IDLE'
        ? 'text-[color:var(--status-watch)]'
        : 'text-muted-foreground';

  const fuelOrEnergy = Math.round(
    selectedVehicle?.isElectric
      ? (hudSnapshot?.battery ?? selectedVehicle?.battery ?? 0)
      : (hudSnapshot?.fuel ?? selectedVehicle?.fuel ?? 0),
  );

  const odometerValue = selectedVehicle
    ? (hudSnapshot?.odometer ?? selectedVehicle.odometer).toLocaleString('de-DE')
    : '—';

  return (
    <div className="surface-premium rounded-xl p-3">
      <div className="group relative h-[340px] rounded-lg overflow-hidden transition-all duration-300">
        <LiveMapOverview
          key={vehicleId ?? 'no-vehicle'}
          className="w-full h-full"
          targetPosition={positionView.mapTargetPosition}
          initialPosition={positionView.mapInitialPosition}
          heading={positionView.isBoundToCurrentVehicle ? liveTelemetry.heading : null}
          speedKmh={positionView.isBoundToCurrentVehicle ? liveTelemetry.speedKmh : null}
          licensePlate={selectedVehicle?.license ?? ''}
          waitingForPosition={positionView.showEmptyState}
          isLiveTracking={positionView.isBoundToCurrentVehicle && liveTelemetry.isLiveTracking}
          isDarkMode={isDarkMode}
          operatorHint={positionView.operatorHint}
          operatorHintSub={positionView.operatorHintSub}
        />

        {statusBadge && !positionView.showEmptyState && (
          <div className="pointer-events-none absolute top-2.5 left-1/2 z-10 -translate-x-1/2 sm:top-3">
            <LiquidGlassLens variant="vehicleHudBadge" intensity="subtle" className="pointer-events-none">
              <span
                className={`sq-map-liquid-badge sq-map-liquid-badge--status sq-map-liquid-badge--${statusBadge.tone}`}
              >
                <span className="sq-map-liquid-badge-dot" aria-hidden="true" />
                <span>{statusBadge.label}</span>
              </span>
            </LiquidGlassLens>
          </div>
        )}

        <div className="vehicle-detail-map-hud">
          <LiquidGlassLens variant="vehicleHudStack" intensity="subtle" className="w-full max-w-[20rem]">
            <LiquidGlassLens variant="vehicleHudTile" intensity="subtle" className="pointer-events-none">
              <div className="liquid-glass-lens__tile-inner">
                <Icon name="circle" className={`h-3.5 w-3.5 ${stateColor}`} />
                <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-foreground/80">
                  State
                </span>
                <span className={`text-sm font-bold leading-tight tabular-nums ${stateColor}`}>
                  {hudDisplayState}
                </span>
              </div>
            </LiquidGlassLens>

            <LiquidGlassLens variant="vehicleHudTile" intensity="subtle" className="pointer-events-none">
              <div className="liquid-glass-lens__tile-inner">
                <Icon
                  name="droplet"
                  className="h-3.5 w-3.5 text-[color:var(--status-positive)]"
                />
                <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-foreground/80">
                  {selectedVehicle?.isElectric ? 'Energy' : 'Fuel'}
                </span>
                <span className="text-sm font-bold leading-tight tabular-nums text-foreground">
                  {fuelOrEnergy}
                  <span className="text-[10px] font-normal text-muted-foreground">%</span>
                </span>
              </div>
            </LiquidGlassLens>

            <LiquidGlassLens variant="vehicleHudTile" intensity="subtle" className="pointer-events-none">
              <div className="liquid-glass-lens__tile-inner">
                <Icon name="gauge" className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-foreground/80">
                  Odometer
                </span>
                <span className="text-sm font-bold leading-tight tabular-nums text-foreground">
                  {odometerValue}
                  <span className="text-[10px] font-normal text-muted-foreground"> km</span>
                </span>
              </div>
            </LiquidGlassLens>
          </LiquidGlassLens>
        </div>
      </div>
    </div>
  );
}
