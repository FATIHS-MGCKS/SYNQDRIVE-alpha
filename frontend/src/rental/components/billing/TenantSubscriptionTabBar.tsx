import {
  chromeTabBarClass,
  chromeTabTriggerClass,
  CHROME_TAB_BAR_SCROLL_CLASS,
} from '../../../components/patterns/chrome-tab-bar';
import { useLanguage } from '../../i18n/LanguageContext';
import { resolveTenantBillingTabLabel } from '../../lib/rental-tenant-billing-i18n';
import {
  TENANT_SUBSCRIPTION_SUB_TAB_IDS,
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
  const { t } = useLanguage();

  return (
    <div
      className={chromeTabBarClass('p-1')}
      role="tablist"
      aria-label={t('tenantBilling.a11y.subTabs')}
      data-testid="tenant-subscription-subtab-bar"
    >
      <div className={CHROME_TAB_BAR_SCROLL_CLASS}>
        {TENANT_SUBSCRIPTION_SUB_TAB_IDS.map((tabId) => {
          const isActive = activeTab === tabId;
          return (
            <button
              key={tabId}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-testid={`tenant-subscription-tab-${tabId}`}
              onClick={() => onTabChange(tabId)}
              className={chromeTabTriggerClass(isActive, 'max-sm:px-3')}
            >
              {resolveTenantBillingTabLabel(tabId, t)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
