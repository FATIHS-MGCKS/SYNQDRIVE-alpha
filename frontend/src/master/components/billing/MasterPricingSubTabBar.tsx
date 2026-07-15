import {
  chromeTabBarClass,
  chromeTabTriggerClass,
  CHROME_TAB_BAR_SCROLL_CLASS,
} from '../../../components/patterns/chrome-tab-bar';
import type { MasterBillingPricingTab } from './master-billing-navigation';
import { MASTER_BILLING_PRICING_TABS } from './master-billing-navigation';

interface MasterPricingSubTabBarProps {
  activeTab: MasterBillingPricingTab;
  onTabChange: (tab: MasterBillingPricingTab) => void;
}

export function MasterPricingSubTabBar({ activeTab, onTabChange }: MasterPricingSubTabBarProps) {
  return (
    <div
      className={chromeTabBarClass('p-1')}
      role="tablist"
      aria-label="Tarife & Preise Unterbereiche"
      data-testid="master-pricing-subtab-bar"
    >
      <div className={CHROME_TAB_BAR_SCROLL_CLASS}>
        {MASTER_BILLING_PRICING_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-testid={`master-pricing-tab-${tab.id}`}
              onClick={() => onTabChange(tab.id)}
              className={chromeTabTriggerClass(isActive, 'max-sm:px-3')}
            >
              <span className="truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
