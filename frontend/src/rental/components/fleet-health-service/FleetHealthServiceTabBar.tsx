import {
  chromeTabBarClass,
  chromeTabTriggerClass,
  CHROME_TAB_BAR_SCROLL_CLASS,
} from '../../../components/patterns/chrome-tab-bar';
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
      className={chromeTabBarClass('p-1')}
      role="tablist"
      aria-label={t('fleetTab.conditionService')}
    >
      <div className={CHROME_TAB_BAR_SCROLL_CLASS}>
        {FLEET_HEALTH_SERVICE_TAB_ORDER.map((tab) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onTabChange(tab)}
              className={chromeTabTriggerClass(isActive)}
            >
              <span className="truncate">{t(TAB_LABEL_KEYS[tab])}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
