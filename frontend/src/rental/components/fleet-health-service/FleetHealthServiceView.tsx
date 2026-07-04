import { ShieldAlert, ShieldCheck, AlertTriangle, CircleDot } from 'lucide-react';
import { useCallback } from 'react';
import type { Vendor } from '../../../lib/api';
import type { StatusTone } from '../../../components/patterns';
import { FleetConditionView, type ConditionCategory } from '../FleetConditionView';
import { FleetHealthKpiCard } from '../fleet/FleetHealthKpiCard';
import { ServiceCenterView } from '../service-center/ServiceCenterView';
import type { ServiceCenterTab } from '../service-center/service-center.types';
import type { ServiceCenterNavState } from '../../lib/service-center-navigation';
import { FleetHealthServiceTabBar } from './FleetHealthServiceTabBar';
import type { FleetHealthServiceTab } from './fleet-health-service.types';
import { useFleetHealthServiceViewModel } from './useFleetHealthServiceViewModel';

interface FleetHealthServiceViewProps {
  activeSubTab: FleetHealthServiceTab;
  onSubTabChange: (tab: FleetHealthServiceTab) => void;
  onDrillDown?: (vehicleId: string, category: ConditionCategory) => void;
  onOpenVendorDetail?: (vendor: Vendor) => void;
  onOpenGlobalTasks?: (taskId: string) => void;
  onCreateTask?: () => void;
  onOpenVehicle?: (vehicleId: string) => void;
  serviceCenterNavigation?: ServiceCenterNavState | null;
  onServiceCenterNavigationConsumed?: () => void;
  onOpenServiceCenter?: (nav?: Partial<ServiceCenterNavState>) => void;
}

function fleetSubTabToServiceCenterTab(tab: FleetHealthServiceTab): ServiceCenterTab | null {
  if (tab === 'vehicles') return null;
  return tab;
}

export function FleetHealthServiceView({
  activeSubTab,
  onSubTabChange,
  onDrillDown,
  onOpenVendorDetail,
  onOpenGlobalTasks,
  onCreateTask,
  onOpenVehicle,
  serviceCenterNavigation,
  onServiceCenterNavigationConsumed,
  onOpenServiceCenter,
}: FleetHealthServiceViewProps) {
  const vm = useFleetHealthServiceViewModel();
  const { healthKpis, healthLoading } = vm;

  const openServiceFromHealth = useCallback(() => {
    onOpenServiceCenter?.();
    onSubTabChange('overview');
  }, [onOpenServiceCenter, onSubTabChange]);

  const healthOverviewCards: Array<{
    key: string;
    label: string;
    value: number;
    hint: string;
    tone: StatusTone;
    icon: typeof ShieldAlert;
    emphasize?: boolean;
  }> = [
    {
      key: 'action',
      label: 'Action required',
      value: healthKpis.actionRequired,
      hint: healthKpis.blocked > 0 ? `${healthKpis.blocked} blocked` : 'blocked or critical',
      tone: 'critical',
      icon: ShieldAlert,
      emphasize: true,
    },
    {
      key: 'review',
      label: 'Needs review',
      value: healthKpis.needsReview,
      hint: 'inspect soon',
      tone: 'warning',
      icon: AlertTriangle,
    },
    {
      key: 'healthy',
      label: 'Healthy',
      value: healthKpis.healthy,
      hint: 'ready for rental',
      tone: 'success',
      icon: ShieldCheck,
    },
    {
      key: 'limited',
      label: 'Limited data',
      value: healthKpis.limited,
      hint:
        healthKpis.naModuleVehicles > 0
          ? `${healthKpis.naModuleVehicles} no tracking`
          : 'not fully assessable',
      tone: 'noData',
      icon: CircleDot,
    },
  ];

  const serviceForcedTab = fleetSubTabToServiceCenterTab(activeSubTab);

  return (
    <div className="space-y-4">
      <FleetHealthServiceTabBar activeTab={activeSubTab} onTabChange={onSubTabChange} />

      {activeSubTab === 'overview' && (
        <div className="space-y-4">
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
                Zustand
              </p>
              <button
                type="button"
                onClick={() => onSubTabChange('vehicles')}
                className="text-[11px] font-semibold text-[color:var(--brand-ink)] hover:underline"
              >
                Alle Fahrzeuge
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {healthOverviewCards.map((card) => {
                const CardIcon = card.icon;
                return (
                  <FleetHealthKpiCard
                    key={card.key}
                    label={card.label}
                    value={healthLoading && healthKpis.total === 0 ? 0 : card.value}
                    hint={card.hint}
                    tone={card.tone}
                    icon={CardIcon}
                    emphasize={card.emphasize}
                    onClick={() => onSubTabChange('vehicles')}
                  />
                );
              })}
            </div>
          </section>

          <ServiceCenterView
            hideHeader
            hideSubTabBar
            forcedTab="overview"
            onOpenVendorDetail={onOpenVendorDetail}
            onOpenGlobalTasks={onOpenGlobalTasks}
            onCreateTask={onCreateTask}
            onOpenVehicle={onOpenVehicle}
            onNavigateToSubTab={(tab) => onSubTabChange(tab as FleetHealthServiceTab)}
          />
        </div>
      )}

      {activeSubTab === 'vehicles' && (
        <FleetConditionView
          embedded
          hideHeaderActions
          onDrillDown={onDrillDown}
          onOpenServiceCenter={openServiceFromHealth}
          onOpenExistingTask={onOpenGlobalTasks}
        />
      )}

      {serviceForcedTab != null && activeSubTab !== 'overview' && (
        <ServiceCenterView
          hideHeader
          hideSubTabBar
          forcedTab={serviceForcedTab}
          showControlBar={false}
          onOpenVendorDetail={onOpenVendorDetail}
          onOpenGlobalTasks={onOpenGlobalTasks}
          onCreateTask={onCreateTask}
          onOpenVehicle={onOpenVehicle}
          navigation={serviceCenterNavigation}
          onNavigationConsumed={onServiceCenterNavigationConsumed}
          onNavigateToSubTab={(tab) => onSubTabChange(tab as FleetHealthServiceTab)}
        />
      )}
    </div>
  );
}
