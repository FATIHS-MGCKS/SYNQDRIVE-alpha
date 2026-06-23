import type { VehicleOverviewSummary } from '../../lib/vehicle-overview.types';
import type { NavigateVehicleOverviewTarget } from '../../lib/vehicle-overview-navigation';
import { vo } from './vehicle-overview-ui';
import { VehicleOverviewReadinessStrip } from './VehicleOverviewReadinessStrip';
import { VehicleOverviewSnapshotRow } from './VehicleOverviewSnapshotRow';

export interface VehicleOverviewQuickViewProps {
  summary: VehicleOverviewSummary;
  onNavigate: NavigateVehicleOverviewTarget;
  orgId?: string;
  vehicleId?: string | null;
}

/**
 * Operator quick-view layer — visually subordinate to the map + health main grid.
 */
export function VehicleOverviewQuickView({
  summary,
  onNavigate,
  orgId,
  vehicleId,
}: VehicleOverviewQuickViewProps) {
  return (
    <div className={vo.stack} aria-label="Vehicle overview summary">
      <VehicleOverviewReadinessStrip
        readiness={summary.readiness}
        isLoading={summary.isLoading}
      />
      <VehicleOverviewSnapshotRow
        cards={summary.cards}
        onNavigate={onNavigate}
        orgId={orgId}
        vehicleId={vehicleId}
      />
    </div>
  );
}
