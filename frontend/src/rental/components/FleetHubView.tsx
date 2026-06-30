import { Activity, Briefcase, Car, RefreshCw } from 'lucide-react';
import { FleetView } from './FleetView';
import { FleetConditionView, type ConditionCategory } from './FleetConditionView';
import { ServiceCenterView } from './service-center/ServiceCenterView';
import { Button } from '../../components/ui/button';
import { useFleetVehicles } from '../FleetContext';
import { useLanguage } from '../i18n/LanguageContext';
import { formatRelativeTime, latestHealthGeneratedAt } from '../lib/fleet-health-control-center';
import type { VehicleData } from '../data/vehicles';
import type { Vendor } from '../../lib/api';
import type { ServiceCenterNavState } from '../lib/service-center-navigation';
import { useMemo } from 'react';

export type FleetTab = 'status' | 'health' | 'service';

interface FleetHubViewProps {
  activeTab: FleetTab;
  onTabChange: (tab: FleetTab) => void;
  onVehicleSelect?: (vehicle: VehicleData) => void;
  onDrillDown?: (vehicleId: string, category: ConditionCategory) => void;
  onOpenVendorDetail?: (vendor: Vendor) => void;
  onOpenGlobalTasks?: (taskId: string) => void;
  onCreateTask?: () => void;
  onOpenVehicle?: (vehicleId: string) => void;
  serviceCenterNavigation?: ServiceCenterNavState | null;
  onServiceCenterNavigationConsumed?: () => void;
  onOpenServiceCenter?: (nav?: Partial<ServiceCenterNavState>) => void;
}

const TAB_ICONS = {
  status: Car,
  health: Activity,
  service: Briefcase,
} as const;

export function FleetHubView({
  activeTab,
  onTabChange,
  onVehicleSelect,
  onDrillDown,
  onOpenVendorDetail,
  onOpenGlobalTasks,
  onCreateTask,
  onOpenVehicle,
  serviceCenterNavigation,
  onServiceCenterNavigationConsumed,
  onOpenServiceCenter,
}: FleetHubViewProps) {
  const { t } = useLanguage();
  const { healthMap, healthLoading, reloadHealth } = useFleetVehicles();

  const lastHealthUpdated = useMemo(
    () => latestHealthGeneratedAt(healthMap),
    [healthMap],
  );

  const tabs: { key: FleetTab; labelKey: 'fleetTab.status' | 'fleetTab.health' | 'fleetTab.service' }[] = [
    { key: 'status', labelKey: 'fleetTab.status' },
    { key: 'health', labelKey: 'fleetTab.health' },
    { key: 'service', labelKey: 'fleetTab.service' },
  ];

  const tabBar = (
    <div className="sq-tab-bar flex w-full max-w-md items-stretch p-1 lg:max-w-lg">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        const Icon = TAB_ICONS[tab.key];
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onTabChange(tab.key)}
            data-active={isActive ? 'true' : undefined}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-[11px] font-semibold transition-all duration-200 sm:px-3 ${
              isActive
                ? 'bg-card text-foreground shadow-[var(--shadow-1)] ring-1 ring-border/60'
                : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
            }`}
          >
            <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" />
            <span className="truncate">{t(tab.labelKey)}</span>
          </button>
        );
      })}
    </div>
  );

  const headerActions =
    activeTab === 'health' ? (
      <div className="flex flex-col items-end gap-1">
        <Button
          type="button"
          variant="neutral"
          size="sm"
          disabled={healthLoading}
          onClick={() => reloadHealth()}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${healthLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
        {lastHealthUpdated ? (
          <span className="text-[10px] text-muted-foreground">
            Updated {formatRelativeTime(lastHealthUpdated)}
          </span>
        ) : null}
      </div>
    ) : null;

  return (
    <div className="mx-auto max-w-[1600px] space-y-5">
      <header className="animate-fade-up space-y-3 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center lg:gap-4 lg:space-y-0">
        <h1 className="min-w-0 truncate font-display text-[length:var(--text-display-lg)] font-bold leading-[1.15] tracking-[var(--tracking-display)] text-foreground lg:justify-self-start">
          {t('view.fleet')}
        </h1>

        <div className="mx-auto w-full lg:justify-self-center">{tabBar}</div>

        <div className="flex min-h-8 items-start justify-end lg:justify-self-end">{headerActions}</div>
      </header>

      {activeTab === 'status' && (
        <FleetView embedded onVehicleSelect={onVehicleSelect} />
      )}
      {activeTab === 'health' && (
        <FleetConditionView
          embedded
          hideHeaderActions
          onDrillDown={onDrillDown}
          onOpenServiceCenter={() => onOpenServiceCenter?.()}
          onOpenExistingTask={onOpenGlobalTasks}
        />
      )}
      {activeTab === 'service' && (
        <ServiceCenterView
          hideHeader
          onOpenVendorDetail={onOpenVendorDetail}
          onOpenGlobalTasks={onOpenGlobalTasks}
          onCreateTask={onCreateTask}
          onOpenVehicle={onOpenVehicle}
          navigation={serviceCenterNavigation}
          onNavigationConsumed={onServiceCenterNavigationConsumed}
        />
      )}
    </div>
  );
}
