import { DashboardSectionLabel } from '../dashboard/dashboardShell';
import {
  buildFleetHealthServiceKpis,
  FleetHealthServiceKpiStrip,
} from './FleetHealthServiceKpiStrip';
import { FleetHealthServicePriorityOverview } from './FleetHealthServicePriorityOverview';
import { fhs } from './fleet-health-service-shell';
import type { FleetHealthServiceViewModel } from './fleet-health-service.view-model';
import type { FleetHealthServiceTab, FleetHealthServiceWorkSection } from './fleet-health-service.types';
import { useLanguage } from '../../i18n/LanguageContext';

interface FleetHealthServiceOverviewPanelProps {
  vm: FleetHealthServiceViewModel & { reloadService?: () => void };
  onNavigateSubTab?: (tab: FleetHealthServiceTab) => void;
  onNavigateWork?: (section: FleetHealthServiceWorkSection) => void;
  onOpenVehicle?: (vehicleId: string) => void;
  onOpenTask?: (taskId: string) => void;
  onCreateTask?: () => void;
}

export function FleetHealthServiceOverviewPanel({
  vm,
  onNavigateSubTab,
  onNavigateWork,
  onOpenVehicle,
  onOpenTask,
  onCreateTask,
}: FleetHealthServiceOverviewPanelProps) {
  const { t } = useLanguage();
  const kpiItems = buildFleetHealthServiceKpis(vm.healthKpis, vm.executionGroups);

  const handleKpiClick = (key: string) => {
    if (key === 'action' || key === 'review' || key === 'limited' || key === 'healthy') {
      onNavigateSubTab?.('vehicles');
      return;
    }
    if (key === 'in_progress') {
      onNavigateWork?.('tasks');
      return;
    }
    if (key === 'overdue') {
      onNavigateWork?.('schedule');
      return;
    }
    if (key === 'vendor') {
      onNavigateWork?.('vendors');
    }
  };

  const handleReload = () => {
    vm.reloadService?.();
  };

  return (
    <div className="space-y-4">
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
          <div className="mb-3">
            <DashboardSectionLabel className="mb-1">
              {t('fleetHealthService.overview.priorityTitle')}
            </DashboardSectionLabel>
            <p className={fhs.meta}>{t('fleetHealthService.overview.prioritySubtitle')}</p>
          </div>
          <FleetHealthServicePriorityOverview
            sections={vm.prioritizedOverviewSections}
            loading={vm.loading}
            healthError={vm.healthError}
            serviceError={vm.serviceError}
            onReload={handleReload}
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
