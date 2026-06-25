import type { VehicleData } from '../../data/vehicles';
import type { VehicleOverviewSummary } from '../../lib/vehicle-overview.types';
import type { NavigateVehicleOverviewTarget } from '../../lib/vehicle-overview-navigation';
import type { ServiceCenterNavState } from '../../lib/service-center-navigation';
import { OverviewLiveMapCard } from './OverviewLiveMapCard';
import { VehicleHealthBoxTelemetryBridge } from './VehicleHealthBoxWired';
import { VehicleOverviewFreshnessHint } from './VehicleOverviewFreshnessHint';
import { VehicleServiceContextPanel } from './VehicleServiceContextPanel';
import { vo } from './vehicle-overview-ui';

export interface VehicleOverviewTabProps {
  selectedVehicle: VehicleData | null;
  orgId: string;
  isDarkMode: boolean;
  summary: VehicleOverviewSummary;
  /**
   * @deprecated Overview no longer renders a quick-navigation layer. The tab bar
   * above is the single navigation. Kept in the prop contract for the App.tsx
   * call site / potential future inline hints — currently unused here.
   */
  onNavigate?: NavigateVehicleOverviewTarget;
  onOpenHealthDetails: () => void;
  onOpenServiceCenter?: (nav?: Partial<ServiceCenterNavState>) => void;
  onOpenVehicleTask?: (taskId: string) => void;
  tasksRefreshToken?: number;
}

/**
 * Vehicle Detail — Overview tab layout:
 * 1. Service & maintenance context
 * 2. Main grid: live map (≈60%) + vehicle health box (≈40%)
 * 3. Optional data freshness hint
 *
 * No local readiness/blocked verdict and no quick-navigation cards: the tab bar
 * is the only navigation, and rental readiness/blocked stays a canonical truth.
 */
export function VehicleOverviewTab({
  selectedVehicle,
  orgId,
  isDarkMode,
  summary,
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
              showDataBasis={false}
            />
          </div>
        </div>
      </section>

      <VehicleOverviewFreshnessHint summary={summary} />
    </div>
  );
}
