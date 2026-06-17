import { Sheet, SheetContent } from '../../../components/ui/sheet';
import type { VehicleHealthResponse } from '../../../lib/api';
import type { VehicleData } from '../../data/vehicles';
import type { HealthDetailTab } from '../../lib/health-detail-utils';
import { HealthVehicleDetailPanel } from './HealthVehicleDetailPanel';

export interface HealthVehicleDetailDrawerProps {
  vehicle: VehicleData | null;
  health: VehicleHealthResponse | undefined;
  healthLoading?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: HealthDetailTab;
}

/**
 * Tablet/mobile slide-over. Desktop uses the inline panel in FleetConditionView.
 */
export function HealthVehicleDetailDrawer({
  vehicle,
  health,
  healthLoading,
  open,
  onOpenChange,
  initialTab = 'overview',
}: HealthVehicleDetailDrawerProps) {
  if (!vehicle) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 bg-card p-0 sm:max-w-xl md:max-w-2xl max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:h-[92vh] max-sm:rounded-t-2xl max-sm:border-t"
      >
        <HealthVehicleDetailPanel
          vehicle={vehicle}
          health={health}
          healthLoading={healthLoading}
          initialTab={initialTab}
          onClose={() => onOpenChange(false)}
          className="h-full min-h-[70vh]"
        />
      </SheetContent>
    </Sheet>
  );
}
