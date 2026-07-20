import { chromeTabBarClass, chromeTabTriggerClass } from '../../../components/patterns/chrome-tab-bar';
import { cn } from '../../../components/ui/utils';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import { FHS_TAB_ID, FHS_TAB_PANEL_ID } from './fleet-health-service-a11y';
import { fhs } from './fleet-health-service-shell';
import {
  FLEET_HEALTH_SERVICE_TAB_ORDER,
  type FleetHealthServiceTab,
} from './fleet-health-service.types';

const TAB_LABEL_KEYS: Record<FleetHealthServiceTab, TranslationKey> = {
  overview: 'fleetHealthService.tab.overview',
  vehicles: 'fleetHealthService.tab.vehicles',
  work: 'fleetHealthService.tab.work',
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
      className={chromeTabBarClass('p-1')}
      role="tablist"
      aria-label={t('fleetHealthService.a11y.mainTabs')}
    >
      <div className="grid w-full grid-cols-2 gap-0.5 sm:grid-cols-4">
        {FLEET_HEALTH_SERVICE_TAB_ORDER.map((tab) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              id={FHS_TAB_ID[tab]}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={FHS_TAB_PANEL_ID[tab]}
              onClick={() => onTabChange(tab)}
              className={cn(
                chromeTabTriggerClass(isActive, 'w-full justify-center'),
                fhs.touchTarget,
                'min-w-0 px-2 sm:px-3.5',
              )}
            >
              <span className="truncate">{t(TAB_LABEL_KEYS[tab])}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
