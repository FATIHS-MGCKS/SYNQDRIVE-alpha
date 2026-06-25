import { useMemo } from 'react';
import type { VehicleOverviewCards, VehicleDetailTab } from '../../lib/vehicle-overview.types';
import type { NavigateVehicleOverviewTarget } from '../../lib/vehicle-overview-navigation';
import { navigateOverviewQuickCardTab } from '../../lib/vehicle-overview-navigation';
import { useVehicleRentalRequirements } from '../../hooks/useVehicleRentalRequirements';
import { deriveRequirementsStatus } from '../../lib/vehicle-rental-requirements.utils';
import { overviewCardIcon, vo } from './vehicle-overview-ui';
import { VehicleOverviewQuickCard } from './VehicleOverviewQuickCard';
import { VehicleRentalRequirementsQuickCard } from './VehicleRentalRequirementsQuickCard';

export interface VehicleOverviewSnapshotRowProps {
  cards: VehicleOverviewCards;
  onNavigate: NavigateVehicleOverviewTarget;
  orgId?: string;
  vehicleId?: string | null;
}

const CARD_ORDER = ['trips', 'bookings', 'tasks', 'damages', 'documents'] as const;

/**
 * @deprecated Removed from the Vehicle Overview — it was a redundant second
 * navigation layer (Quick navigation cards) duplicating the tab bar. Kept for
 * potential reuse only; do not re-add to the Overview.
 */
export function VehicleOverviewSnapshotRow({
  cards,
  onNavigate,
  orgId,
  vehicleId,
}: VehicleOverviewSnapshotRowProps) {
  const rentalEnabled = Boolean(orgId && vehicleId);
  const { effective, requirements, orgDefaults, loading, error, reload } =
    useVehicleRentalRequirements(orgId ?? null, vehicleId ?? null, rentalEnabled);

  const rentalSummary = useMemo(
    () => deriveRequirementsStatus(effective, requirements, orgDefaults?.configured ?? false),
    [effective, requirements, orgDefaults],
  );

  const goToTab = (tab: VehicleDetailTab) => {
    onNavigate({ tab } as Parameters<NavigateVehicleOverviewTarget>[0]);
  };

  return (
    <section className={vo.snapshotSection} aria-labelledby="vehicle-overview-snapshot-label">
      <p id="vehicle-overview-snapshot-label" className={vo.snapshotLabel}>
        Quick navigation
      </p>
      <div className={vo.cardScroll} role="list">
        {rentalEnabled && (
          <VehicleRentalRequirementsQuickCard
            summary={rentalSummary}
            loading={loading && !effective}
            error={error}
            onNavigate={goToTab}
            onRetry={() => void reload()}
          />
        )}
        {CARD_ORDER.map((key) => {
          const card = cards[key];
          return (
            <div key={card.id} role="listitem" className="min-w-0">
              <VehicleOverviewQuickCard
                icon={overviewCardIcon(card.id)}
                label={card.title}
                headline={card.headline}
                subline={card.subline}
                status={card.status}
                loadState={card.loadState}
                targetTab={card.targetTab}
                onNavigate={() => navigateOverviewQuickCardTab(onNavigate, card.id)}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
