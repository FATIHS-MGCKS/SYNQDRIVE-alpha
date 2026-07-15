import {
  chromeTabBarClass,
  chromeTabTriggerClass,
  CHROME_TAB_BAR_SCROLL_CLASS,
} from '../../../components/patterns/chrome-tab-bar';

interface MasterBillingSubTabBarProps<T extends string> {
  tabs: Array<{ id: T; label: string }>;
  activeTab: T;
  onTabChange: (tab: T) => void;
  ariaLabel: string;
  testIdPrefix: string;
}

export function MasterBillingSubTabBar<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  ariaLabel,
  testIdPrefix,
}: MasterBillingSubTabBarProps<T>) {
  return (
    <div
      className={chromeTabBarClass('p-1')}
      role="tablist"
      aria-label={ariaLabel}
      data-testid={`${testIdPrefix}-subtabbar`}
    >
      <div className={CHROME_TAB_BAR_SCROLL_CLASS}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-testid={`${testIdPrefix}-subtab-${tab.id}`}
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
