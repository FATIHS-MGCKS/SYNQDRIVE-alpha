import { cn } from '../../../components/ui/utils';
import type { CustomerDetailTab } from './customerDetailTypes';
import { cdv } from './customer-detail-ui';

interface CustomerDetailTabBarProps {
  tabs: { key: CustomerDetailTab; label: string; count?: number }[];
  activeTab: CustomerDetailTab;
  onTabChange: (tab: CustomerDetailTab) => void;
}

export function CustomerDetailTabBar({ tabs, activeTab, onTabChange }: CustomerDetailTabBarProps) {
  return (
    <div
      className={cdv.bottomTabBar}
      role="tablist"
      aria-label="Kundendetail Bereiche"
    >
      <div className={cdv.bottomTabScroll}>
        {tabs.map((tab) => {
          const active = activeTab === tab.key;
          const label = tab.count != null ? `${tab.label} (${tab.count})` : tab.label;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onTabChange(tab.key)}
              className={cn(
                cdv.bottomTabButton,
                active ? cdv.bottomTabButtonActive : cdv.bottomTabButtonIdle,
              )}
            >
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
