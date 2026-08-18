import { MasterPageTabs } from '../../shell';

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
    <MasterPageTabs
      tabs={tabs.map((tab) => ({ id: tab.id, label: tab.label }))}
      activeId={activeTab}
      onChange={onTabChange}
      ariaLabel={ariaLabel}
      level="secondary"
      testIdPrefix={testIdPrefix}
    />
  );
}
