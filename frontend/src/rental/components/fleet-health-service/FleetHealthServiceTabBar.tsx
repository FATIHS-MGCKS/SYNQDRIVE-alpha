import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import {
  FLEET_HEALTH_SERVICE_TAB_ORDER,
  type FleetHealthServiceTab,
} from './fleet-health-service.types';

const TAB_LABEL_KEYS: Record<FleetHealthServiceTab, TranslationKey> = {
  overview: 'fleetHealthService.tab.overview',
  vehicles: 'fleetHealthService.tab.vehicles',
  tasks: 'fleetHealthService.tab.tasks',
  schedule: 'fleetHealthService.tab.schedule',
  vendors: 'fleetHealthService.tab.vendors',
  history: 'fleetHealthService.tab.history',
};

interface FleetHealthServiceTabBarProps {
  activeTab: FleetHealthServiceTab;
  onTabChange: (tab: FleetHealthServiceTab) => void;
}

export function FleetHealthServiceTabBar({ activeTab, onTabChange }: FleetHealthServiceTabBarProps) {
  const { t } = useLanguage();

  return (
    <div
      className="sq-tab-bar p-1 flex items-center w-full"
      role="tablist"
      aria-label={t('fleetTab.conditionService')}
    >
      <div className="flex flex-nowrap gap-0.5 flex-1 min-w-0 overflow-x-auto scrollbar-thin [scrollbar-width:thin]">
        {FLEET_HEALTH_SERVICE_TAB_ORDER.map((tab) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onTabChange(tab)}
              className={`min-w-0 shrink-0 px-3.5 py-1.5 rounded-[calc(var(--radius-md)-2px)] text-[11px] leading-[16.2px] font-semibold tracking-[-0.003em] whitespace-nowrap transition-all duration-200 ${
                isActive
                  ? 'bg-card text-foreground shadow-[var(--shadow-1)]'
                  : 'text-muted-foreground hover:text-foreground hover:bg-background/60'
              }`}
            >
              <span className="truncate">{t(TAB_LABEL_KEYS[tab])}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
