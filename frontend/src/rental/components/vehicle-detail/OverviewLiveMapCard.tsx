import { Icon } from '../ui/Icon';
import { LiquidGlassLens } from '../../../components/surface';
import { cn } from '../../../components/ui/utils';
import { useShallow } from 'zustand/react/shallow';
import { LiveMapOverview } from '../LiveMapOverview';
import type { VehicleData } from '../../data/vehicles';
import { useVehicleLiveMapStore } from '../../stores/useVehicleLiveMapStore';
import {
  deriveOverviewMapPosition,
  type OverviewMapPositionMode,
} from '../../lib/overview-map-position';
import {
  formatTelemetryInteger,
  formatTelemetryPercentValue,
  resolveEnergyPercentForDisplay,
  resolveTelemetryScalarForDisplay,
} from '../../lib/telemetry-field-semantics';

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

  const fuelOrEnergy = formatTelemetryPercentValue(
    resolveEnergyPercentForDisplay({
      isElectric: selectedVehicle?.isElectric === true,
      fuelPercent: resolveTelemetryScalarForDisplay(
        hudSnapshot?.fuel,
        selectedVehicle?.fuelPercent,
        selectedVehicle?.fuel,
      ),
      evSocPercent: resolveTelemetryScalarForDisplay(
        hudSnapshot?.battery,
        selectedVehicle?.evSoc,
        selectedVehicle?.battery,
      ),
    }),
  );

  const odometerValue = formatTelemetryInteger(
    resolveTelemetryScalarForDisplay(
      hudSnapshot?.odometer,
      selectedVehicle?.odometerKm,
      selectedVehicle?.odometer,
    ),
  );
  const odometerCompact = odometerValue.length > 6;

  return (
    <div className="surface-premium rounded-xl p-3">
      <div className="group relative h-[340px] rounded-lg overflow-hidden transition-all duration-300 synq-map-hud-surface">
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
            <LiquidGlassLens
              variant="vehicleHudBadge"
              renderMode="lens"
              intensity="subtle"
              className="pointer-events-none"
            >
              <span
                className={`liquid-glass-lens__hud-badge liquid-glass-lens__hud-badge--${statusBadge.tone}`}
              >
                <span className="liquid-glass-lens__hud-badge-dot" aria-hidden="true" />
                <span className="liquid-glass-lens__hud-badge__label">{statusBadge.label}</span>
              </span>
            </LiquidGlassLens>
          </div>
        )}

        <div className="vehicle-detail-map-hud">
          <div className="vehicle-hud-tile-row">
            <LiquidGlassLens
              variant="vehicleHudTile"
              renderMode="lens"
              intensity="subtle"
              className="pointer-events-none"
            >
              <div className="liquid-glass-lens__tile-inner">
                <span className="liquid-glass-lens__tile-icon">
                  <Icon name="circle" className={`h-3 w-3 ${stateColor}`} />
                </span>
                <span className="liquid-glass-lens__tile-label">State</span>
                <span className={`liquid-glass-lens__tile-state ${stateColor}`}>
                  {hudDisplayState}
                </span>
              </div>
            </LiquidGlassLens>

            <LiquidGlassLens
              variant="vehicleHudTile"
              renderMode="lens"
              intensity="subtle"
              className="pointer-events-none"
            >
              <div className="liquid-glass-lens__tile-inner">
                <span className="liquid-glass-lens__tile-icon">
                  <Icon
                    name="droplet"
                    className="h-3 w-3 text-[color:var(--status-positive)]"
                  />
                </span>
                <span className="liquid-glass-lens__tile-label">
                  {selectedVehicle?.isElectric ? 'Energy' : 'Fuel'}
                </span>
                <span className="liquid-glass-lens__tile-value-row">
                  <span className="liquid-glass-lens__tile-value">{fuelOrEnergy}</span>
                  {fuelOrEnergy !== '—' ? (
                    <span className="liquid-glass-lens__tile-unit">%</span>
                  ) : null}
                </span>
              </div>
            </LiquidGlassLens>

            <LiquidGlassLens
              variant="vehicleHudTile"
              renderMode="lens"
              intensity="subtle"
              className="liquid-glass-lens--vehicleHudTileOdometer pointer-events-none"
            >
              <div className="liquid-glass-lens__tile-inner">
                <span className="liquid-glass-lens__tile-icon">
                  <Icon name="gauge" className="h-3 w-3 text-muted-foreground" />
                </span>
                <span className="liquid-glass-lens__tile-label">Odometer</span>
                <span className="liquid-glass-lens__tile-value-row">
                  <span
                    className={cn(
                      'liquid-glass-lens__tile-value',
                      odometerCompact && 'liquid-glass-lens__tile-value--compact',
                    )}
                  >
                    {odometerValue}
                  </span>
                  {odometerValue !== '—' ? (
                    <span className="liquid-glass-lens__tile-unit">km</span>
                  ) : null}
                </span>
              </div>
            </LiquidGlassLens>
          </div>
        </div>
      </div>
    </div>
  );
}
