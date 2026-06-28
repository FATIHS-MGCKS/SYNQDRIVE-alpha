import { cn } from '../../../components/ui/utils';
import { Button } from '../../../components/ui/button';
import type { CustomerDetailTab } from './customerDetailTypes';
import { cdv } from './customer-detail-ui';

interface CustomerDetailTabBarProps {
  tabs: { key: CustomerDetailTab; label: string; count?: number }[];
  activeTab: CustomerDetailTab;
  onTabChange: (tab: CustomerDetailTab) => void;
}

export function CustomerDetailTabBar({ tabs, activeTab, onTabChange }: CustomerDetailTabBarProps) {
  return (
    <div className={cdv.tabBar} role="tablist" aria-label="Kundendetail Bereiche">
      {tabs.map((tab) => {
        const active = activeTab === tab.key;
        const label =
          tab.count != null ? `${tab.label} (${tab.count})` : tab.label;
        return (
          <Button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active}
            size="sm"
            variant={active ? 'outline' : 'ghost'}
            className={cn(
              'h-8 shrink-0 px-3 text-xs',
              active && 'border-border bg-card text-foreground shadow-sm',
            )}
            onClick={() => onTabChange(tab.key)}
          >
            {label}
          </Button>
        );
      })}
    </div>
  );
}
