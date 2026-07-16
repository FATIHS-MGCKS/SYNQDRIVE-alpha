import {
  chromeTabBarClass,
  chromeTabTriggerClass,
  CHROME_TAB_BAR_SCROLL_CLASS,
} from '../../../components/patterns/chrome-tab-bar';
import {
  TENANT_SUBSCRIPTION_SUB_TABS,
  type TenantSubscriptionSubTab,
} from './tenant-billing-navigation';

interface TenantSubscriptionTabBarProps {
  activeTab: TenantSubscriptionSubTab;
  onTabChange: (tab: TenantSubscriptionSubTab) => void;
}

export function TenantSubscriptionTabBar({
  activeTab,
  onTabChange,
}: TenantSubscriptionTabBarProps) {
  return (
    <div
      className={chromeTabBarClass('p-1')}
      role="tablist"
      aria-label="SynqDrive-Abonnement Bereiche"
      data-testid="tenant-subscription-subtab-bar"
    >
      <div className={CHROME_TAB_BAR_SCROLL_CLASS}>
        {TENANT_SUBSCRIPTION_SUB_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-testid={`tenant-subscription-tab-${tab.id}`}
              onClick={() => onTabChange(tab.id)}
              className={chromeTabTriggerClass(isActive, 'max-sm:px-3')}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
