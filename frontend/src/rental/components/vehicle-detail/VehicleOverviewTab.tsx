import type { VehicleData } from '../../data/vehicles';
import type { VehicleOverviewSummary } from '../../lib/vehicle-overview.types';
import type { NavigateVehicleOverviewTarget } from '../../lib/vehicle-overview-navigation';
import type { ServiceCenterNavState } from '../../lib/service-center-navigation';
import { OverviewLiveMapCard } from './OverviewLiveMapCard';
import { VehicleHealthBoxTelemetryBridge } from './VehicleHealthBoxWired';
import { VehicleOverviewFreshnessHint } from './VehicleOverviewFreshnessHint';
import { VehicleOverviewQuickView } from './VehicleOverviewQuickView';
import { VehicleServiceContextPanel } from './VehicleServiceContextPanel';
import { vo } from './vehicle-overview-ui';

export interface VehicleOverviewTabProps {
  selectedVehicle: VehicleData | null;
  orgId: string;
  isDarkMode: boolean;
  summary: VehicleOverviewSummary;
  onNavigate: NavigateVehicleOverviewTarget;
  onOpenHealthDetails: () => void;
  onOpenServiceCenter?: (nav?: Partial<ServiceCenterNavState>) => void;
  onOpenVehicleTask?: (taskId: string) => void;
  tasksRefreshToken?: number;
}

/**
 * Vehicle Detail — Overview tab layout:
 * 1. Readiness strip + snapshot quick cards (navigation layer)
 * 2. Main grid: live map (≈60%) + vehicle health box (≈40%)
 * 3. Optional data freshness hint
 */
export function VehicleOverviewTab({
  selectedVehicle,
  orgId,
  isDarkMode,
  summary,
  onNavigate,
  onOpenHealthDetails,
  onOpenServiceCenter,
  onOpenVehicleTask,
  tasksRefreshToken,
}: VehicleOverviewTabProps) {
  const vehicleLabel = selectedVehicle
    ? [selectedVehicle.license, selectedVehicle.make, selectedVehicle.model].filter(Boolean).join(' · ')
    : '';

  return (
    <div className={vo.page} key={selectedVehicle?.id ?? 'no-vehicle'}>
      <VehicleOverviewQuickView
        summary={summary}
        onNavigate={onNavigate}
        orgId={orgId}
        vehicleId={selectedVehicle?.id ?? null}
      />

      {selectedVehicle?.id && onOpenServiceCenter && (
        <VehicleServiceContextPanel
          vehicleId={selectedVehicle.id}
          vehicleLabel={vehicleLabel}
          refreshToken={tasksRefreshToken}
          onOpenServiceCenter={onOpenServiceCenter}
          onOpenTask={onOpenVehicleTask}
        />
      )}

      <section className={vo.mainSection} aria-label="Live vehicle status">
        <div className={vo.mainGrid}>
          <div className={vo.mapColumn}>
            <OverviewLiveMapCard
              selectedVehicle={selectedVehicle}
              orgId={orgId}
              isDarkMode={isDarkMode}
            />
          </div>

          <div className={vo.healthColumn}>
            <VehicleHealthBoxTelemetryBridge
              selectedVehicle={selectedVehicle}
              isDarkMode={isDarkMode}
              onViewDetails={onOpenHealthDetails}
            />
          </div>
        </div>
      </section>

      <VehicleOverviewFreshnessHint summary={summary} />
    </div>
  );
}
