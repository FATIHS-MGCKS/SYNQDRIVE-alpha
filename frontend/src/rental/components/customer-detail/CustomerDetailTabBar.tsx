import { useEffect, useRef } from 'react';

import { cn } from '../../../components/ui/utils';
import type { CustomerDetailTab } from './customerDetailTypes';
import { cdv } from './customer-detail-ui';

const TAB_PANEL_ID = 'customer-detail-tabpanel';

export interface CustomerDetailTabItem {
  key: CustomerDetailTab;
  label: string;
  mobileLabel?: string;
  count?: number;
}

interface CustomerDetailTabBarProps {
  tabs: CustomerDetailTabItem[];
  activeTab: CustomerDetailTab;
  onTabChange: (tab: CustomerDetailTab) => void;
}

function tabCountSuffix(count?: number): string {
  return count != null ? ` (${count})` : '';
}

export function CustomerDetailTabBar({ tabs, activeTab, onTabChange }: CustomerDetailTabBarProps) {
  const tabRefs = useRef<Partial<Record<CustomerDetailTab, HTMLButtonElement | null>>>({});

  useEffect(() => {
    const node = tabRefs.current[activeTab];
    if (!node || typeof node.scrollIntoView !== 'function') return;

    try {
      node.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    } catch {
      node.scrollIntoView();
    }
  }, [activeTab]);

  return (
    <div className={cdv.tabBarShell}>
      <div className={cdv.tabBarRail} role="tablist" aria-label="Kundendetail Bereiche">
        <div className={cdv.tabBarScroller}>
          {tabs.map((tab) => {
            const active = activeTab === tab.key;
            const countSuffix = tabCountSuffix(tab.count);
            const mobileLabel = tab.mobileLabel ?? tab.label;
            const tabId = `customer-detail-tab-${tab.key}`;

            return (
              <button
                key={tab.key}
                ref={(node) => {
                  tabRefs.current[tab.key] = node;
                }}
                id={tabId}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={TAB_PANEL_ID}
                data-active={active ? 'true' : undefined}
                onClick={() => onTabChange(tab.key)}
                className={cn(
                  cdv.tabButton,
                  active ? cdv.tabButtonActive : cdv.tabButtonInactive,
                )}
              >
                <span className="sm:hidden">{mobileLabel}{countSuffix}</span>
                <span className="hidden sm:inline">{tab.label}{countSuffix}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export { TAB_PANEL_ID as CUSTOMER_DETAIL_TAB_PANEL_ID };
