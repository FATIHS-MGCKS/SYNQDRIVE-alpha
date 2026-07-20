import type { ApiTask, Vendor } from '../../../lib/api';
import { ServiceHistoryPanel } from '../service-center/ServiceHistoryPanel';
import { DashboardSectionLabel } from '../dashboard/dashboardShell';
import { fhs } from './fleet-health-service-shell';

interface FleetHealthServiceHistoryPanelProps {
  tasks: ApiTask[];
  vendors: Vendor[];
  loading?: boolean;
  onOpenVehicle?: (vehicleId: string) => void;
  initialVehicleId?: string;
}

export function FleetHealthServiceHistoryPanel({
  tasks,
  vendors,
  loading,
  onOpenVehicle,
  initialVehicleId,
}: FleetHealthServiceHistoryPanelProps) {
  return (
    <div className="space-y-3">
      <div className={fhs.panel}>
        <div className={fhs.panelBody}>
          <DashboardSectionLabel className="mb-1">Verlauf</DashboardSectionLabel>
          <p className="text-[12px] text-muted-foreground">
            Vereinheitlichte Servicehistorie aus Aufgaben, Servicefällen, Serviceereignissen und
            stabil verknüpften Dokumenten/Rechnungen.
          </p>
        </div>
      </div>
      <ServiceHistoryPanel
        tasks={tasks}
        vendors={vendors}
        loading={loading}
        onOpenVehicle={onOpenVehicle}
        initialVehicleId={initialVehicleId}
      />
    </div>
  );
}
