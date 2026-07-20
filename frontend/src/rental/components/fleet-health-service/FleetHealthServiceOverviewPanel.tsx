import { DashboardSectionLabel } from '../dashboard/dashboardShell';
import {
  buildFleetHealthServiceKpis,
  FleetHealthServiceKpiStrip,
} from './FleetHealthServiceKpiStrip';
import { FleetHealthServicePrioritizedList } from './FleetHealthServicePrioritizedList';
import { FleetHealthServiceFreshnessIndicator } from './FleetHealthServiceFreshnessIndicator';
import { fhs } from './fleet-health-service-shell';
import type { FleetHealthServiceViewModel } from './fleet-health-service.view-model';
import type { FleetHealthServiceTab } from './fleet-health-service.types';

interface FleetHealthServiceOverviewPanelProps {
  vm: FleetHealthServiceViewModel;
  onNavigateSubTab?: (tab: FleetHealthServiceTab) => void;
  onOpenVehicle?: (vehicleId: string) => void;
  onOpenTask?: (taskId: string) => void;
  onCreateTask?: () => void;
}

export function FleetHealthServiceOverviewPanel({
  vm,
  onNavigateSubTab,
  onOpenVehicle,
  onOpenTask,
  onCreateTask,
}: FleetHealthServiceOverviewPanelProps) {
  const kpiItems = buildFleetHealthServiceKpis(vm.healthKpis, vm.executionGroups);

  const handleKpiClick = (key: string) => {
    if (key === 'action' || key === 'review' || key === 'limited' || key === 'healthy') {
      onNavigateSubTab?.('vehicles');
      return;
    }
    if (key === 'in_progress' || key === 'overdue' || key === 'vendor') {
      onNavigateSubTab?.('tasks');
    }
  };

  return (
    <div className="space-y-4">
      <section className="flex items-center justify-between gap-2">
        <DashboardSectionLabel>Datenaktualität</DashboardSectionLabel>
        <FleetHealthServiceFreshnessIndicator />
      </section>

      <section className="space-y-2">
        <DashboardSectionLabel>Triage-Kennzahlen</DashboardSectionLabel>
        <FleetHealthServiceKpiStrip
          items={kpiItems}
          loading={vm.loading}
          onItemClick={handleKpiClick}
        />
      </section>

      <section className={fhs.panel}>
        <div className={fhs.panelBody}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <DashboardSectionLabel className="mb-1">
                Priorisierte Fahrzeuge &amp; Aufgaben
              </DashboardSectionLabel>
              <p className={fhs.meta}>
                Zustandssignale und offene Abarbeitung — ohne doppelte Zeilen pro Fahrzeug.
              </p>
            </div>
          </div>
          <FleetHealthServicePrioritizedList
            rows={vm.prioritizedOverviewRows}
            loading={vm.loading}
            onOpenVehicle={onOpenVehicle}
            onOpenTask={onOpenTask}
            onCreateTask={() => onCreateTask?.()}
            onReviewVehicle={onOpenVehicle}
          />
        </div>
      </section>
    </div>
  );
}
