import { Activity, Car, RefreshCw, Wifi } from 'lucide-react';
import { FleetView } from './FleetView';
import { FleetConnectivityTab } from './fleet-connectivity/FleetConnectivityTab';
import { type ConditionCategory } from './FleetConditionView';
import { FleetHealthServiceView } from './fleet-health-service/FleetHealthServiceView';
import {
  normalizeFleetTab,
  type FleetHealthServiceTab,
  type FleetTab,
  type FleetTabInput,
} from './fleet-health-service/fleet-health-service.types';
import { Button } from '../../components/ui/button';
import { useFleetVehicles } from '../FleetContext';
import { useLanguage } from '../i18n/LanguageContext';
import {
  chromeTabBarClass,
  chromeTabTriggerClass,
} from '../../components/patterns/chrome-tab-bar';
import { formatRelativeTime, latestHealthGeneratedAt } from '../lib/fleet-health-control-center';
import type { VehicleData } from '../data/vehicles';
import type { Vendor } from '../../lib/api';
import type { ServiceCenterNavState } from '../lib/service-center-navigation';
import { useMemo } from 'react';

export type { FleetTab, FleetTabInput, FleetHealthServiceTab };

interface FleetHubViewProps {
  activeTab: FleetTabInput;
  onTabChange: (tab: FleetTab) => void;
  healthServiceSubTab: FleetHealthServiceTab;
  onHealthServiceSubTabChange: (tab: FleetHealthServiceTab) => void;
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
  'condition-service': Activity,
  connectivity: Wifi,
} as const;

export function FleetHubView({
  activeTab: activeTabInput,
  onTabChange,
  healthServiceSubTab,
  onHealthServiceSubTabChange,
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
  const { t, locale } = useLanguage();
  const { healthMap, healthLoading, reloadHealth } = useFleetVehicles();

  const activeTab = normalizeFleetTab(activeTabInput).tab;

  const lastHealthUpdated = useMemo(
    () => latestHealthGeneratedAt(healthMap),
    [healthMap],
  );

  const tabs: {
    key: FleetTab;
    labelKey: 'fleetTab.status' | 'fleetTab.conditionService' | 'fleetTab.connectivity';
  }[] = [
    { key: 'status', labelKey: 'fleetTab.status' },
    { key: 'condition-service', labelKey: 'fleetTab.conditionService' },
    { key: 'connectivity', labelKey: 'fleetTab.connectivity' },
  ];

  const tabBar = (
    <div
      className={chromeTabBarClass(
        'flex max-w-full items-stretch gap-0.5 overflow-x-auto p-1 scrollbar-thin [scrollbar-width:thin] lg:max-w-2xl',
      )}
      role="tablist"
      aria-label={t('view.fleet')}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        const Icon = TAB_ICONS[tab.key];
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onTabChange(tab.key)}
            className={chromeTabTriggerClass(
              isActive,
              'flex min-w-[7.5rem] shrink-0 flex-1 items-center justify-center gap-1.5 sm:min-w-0',
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" />
            <span className="truncate">{t(tab.labelKey)}</span>
          </button>
        );
      })}
    </div>
  );

  const lastHealthUpdatedLabel = lastHealthUpdated
    ? locale === 'de'
      ? `Aktualisiert ${formatRelativeTime(lastHealthUpdated)}`
      : `Updated ${formatRelativeTime(lastHealthUpdated)}`
    : null;

  const showHealthRefresh =
    activeTab === 'condition-service' &&
    (healthServiceSubTab === 'vehicles' || healthServiceSubTab === 'overview');

  const healthHeaderActions = showHealthRefresh ? (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="neutral"
        size="sm"
        disabled={healthLoading}
        onClick={() => reloadHealth()}
        className="hidden sm:inline-flex"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${healthLoading ? 'animate-spin' : ''}`} />
        {locale === 'de' ? 'Aktualisieren' : 'Refresh'}
      </Button>
      {lastHealthUpdatedLabel ? (
        <span className="text-[10px] text-muted-foreground">{lastHealthUpdatedLabel}</span>
      ) : null}
    </div>
  ) : null;

  return (
    <div className="mx-auto max-w-[1600px] space-y-5">
      <header className="animate-fade-up space-y-3 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center lg:gap-4 lg:space-y-0">
        <h1 className="min-w-0 truncate font-display text-[length:var(--text-display-lg)] font-bold leading-[1.15] tracking-[var(--tracking-display)] text-foreground lg:justify-self-start">
          {t('view.fleet')}
        </h1>

        <div className="mx-auto w-full lg:justify-self-center">
          {tabBar}
          {showHealthRefresh && lastHealthUpdatedLabel ? (
            <p className="mt-1.5 text-center text-[12px] font-normal text-muted-foreground sm:hidden">
              {lastHealthUpdatedLabel}
            </p>
          ) : null}
        </div>

        <div className="hidden min-h-8 items-start justify-end sm:flex lg:justify-self-end">
          {healthHeaderActions}
        </div>
      </header>

      {activeTab === 'status' && (
        <FleetView embedded onVehicleSelect={onVehicleSelect} />
      )}
      {activeTab === 'condition-service' && (
        <FleetHealthServiceView
          activeSubTab={healthServiceSubTab}
          onSubTabChange={onHealthServiceSubTabChange}
          onDrillDown={onDrillDown}
          onOpenVendorDetail={onOpenVendorDetail}
          onOpenGlobalTasks={onOpenGlobalTasks}
          onCreateTask={onCreateTask}
          onOpenVehicle={onOpenVehicle}
          serviceCenterNavigation={serviceCenterNavigation}
          onServiceCenterNavigationConsumed={onServiceCenterNavigationConsumed}
          onOpenServiceCenter={onOpenServiceCenter}
        />
      )}
      {activeTab === 'connectivity' && <FleetConnectivityTab embedded />}
    </div>
  );
}
