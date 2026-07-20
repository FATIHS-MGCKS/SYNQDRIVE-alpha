import { DashboardSectionLabel } from '../dashboard/dashboardShell';
import {
  buildFleetHealthServiceKpiGroups,
  FleetHealthServiceKpiStrip,
  type FleetHealthServiceKpiItem,
} from './FleetHealthServiceKpiStrip';
import { FleetHealthServicePriorityOverview } from './FleetHealthServicePriorityOverview';
import { fhs } from './fleet-health-service-shell';
import type { FleetHealthServiceViewModel } from './fleet-health-service.view-model';
import type {
  FleetHealthServiceNavState,
  FleetHealthServiceTab,
  FleetHealthServiceWorkSection,
} from './fleet-health-service.types';
import { sanitizeFleetHealthServiceNavState } from './fleet-health-service.types';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';

const KPI_LABEL_KEYS: Record<string, TranslationKey> = {
  blocked: 'fleetHealthService.kpi.blocked',
  review: 'fleetHealthService.kpi.review',
  limited: 'fleetHealthService.kpi.limited',
  healthy: 'fleetHealthService.kpi.healthy',
  overdue: 'fleetHealthService.kpi.overdue',
  due_today: 'fleetHealthService.kpi.dueToday',
  in_progress: 'fleetHealthService.kpi.inProgress',
  vendor: 'fleetHealthService.kpi.vendor',
};

const KPI_HINT_KEYS: Record<string, TranslationKey> = {
  blocked: 'fleetHealthService.kpi.hint.blocked',
  review: 'fleetHealthService.kpi.hint.review',
  limited: 'fleetHealthService.kpi.hint.limited',
  healthy: 'fleetHealthService.kpi.hint.healthy',
  overdue: 'fleetHealthService.kpi.hint.overdue',
  due_today: 'fleetHealthService.kpi.hint.dueToday',
  in_progress: 'fleetHealthService.kpi.hint.inProgress',
  vendor: 'fleetHealthService.kpi.hint.vendor',
};

interface FleetHealthServiceOverviewPanelProps {
  vm: FleetHealthServiceViewModel & { reloadService?: () => void };
  onNavChange?: (nav: FleetHealthServiceNavState) => void;
  nav?: FleetHealthServiceNavState;
  onNavigateSubTab?: (tab: FleetHealthServiceTab) => void;
  onNavigateWork?: (section: FleetHealthServiceWorkSection) => void;
  onOpenVehicle?: (vehicleId: string) => void;
  onOpenTask?: (taskId: string) => void;
  onCreateTask?: () => void;
}

export function FleetHealthServiceOverviewPanel({
  vm,
  onNavChange,
  nav,
  onNavigateSubTab,
  onNavigateWork,
  onOpenVehicle,
  onOpenTask,
  onCreateTask,
}: FleetHealthServiceOverviewPanelProps) {
  const { t } = useLanguage();
  const kpiGroups = buildFleetHealthServiceKpiGroups({
    healthKpis: vm.healthKpis,
    execution: vm.executionGroups,
    healthError: vm.healthError,
    serviceError: vm.serviceError,
    healthLoading: vm.healthLoading,
    serviceLoading: vm.serviceLoading,
  }).map((group) => ({
    ...group,
    title:
      group.key === 'health'
        ? t('fleetHealthService.kpi.group.health')
        : t('fleetHealthService.kpi.group.execution'),
    items: group.items.map((item) => ({
      ...item,
      label: t(KPI_LABEL_KEYS[item.key] ?? 'fleetHealthService.kpi.blocked'),
      hint: t(KPI_HINT_KEYS[item.key] ?? 'fleetHealthService.kpi.hint.blocked'),
    })),
  }));

  const applyNav = (next: FleetHealthServiceNavState) => {
    onNavChange?.(sanitizeFleetHealthServiceNavState(next));
  };

  const handleKpiClick = (item: FleetHealthServiceKpiItem) => {
    if (item.domain === 'health' && item.vehicleStatusFilter) {
      if (onNavChange && nav) {
        applyNav({
          ...nav,
          tab: 'vehicles',
          vehicleStatusFilter: item.vehicleStatusFilter,
          taskFilter: undefined,
          serviceCaseFilter: undefined,
        });
      } else {
        onNavigateSubTab?.('vehicles');
      }
      return;
    }

    if (item.domain === 'execution') {
      if (onNavChange && nav) {
        applyNav({
          ...nav,
          tab: 'work',
          workSection: item.workSection ?? 'tasks',
          vehicleStatusFilter: undefined,
          serviceCaseFilter: undefined,
          taskFilter: item.taskFilter,
        });
      } else {
        onNavigateWork?.(item.workSection ?? 'tasks');
      }
    }
  };

  const handleReload = () => {
    vm.reloadService?.();
  };

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <DashboardSectionLabel>{t('fleetHealthService.kpi.sectionLabel')}</DashboardSectionLabel>
        <FleetHealthServiceKpiStrip groups={kpiGroups} onItemClick={handleKpiClick} />
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
