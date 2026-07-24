import { cn } from '../../../components/ui/utils';
import {
  chromeTabBarClass,
  chromeTabTriggerClass,
  CHROME_TAB_BAR_SCROLL_CLASS,
} from '../../../components/patterns/chrome-tab-bar';
import { useRovingTablist } from '../../../hooks/useRovingTablist';
import {
  VEHICLE_DETAIL_TAB_ID,
  VEHICLE_DETAIL_TAB_KEYS,
  VEHICLE_DETAIL_TAB_LABELS,
  VEHICLE_DETAIL_TAB_PANEL_ID,
} from '../../lib/vehicle-detail-a11y';
import { VEHICLE_DETAIL_TAB_TRIGGER_CLASS } from '../../lib/vehicle-detail-mobile-ui';
import type { VehicleDetailTab } from '../../lib/vehicle-overview.types';

interface VehicleDetailTabBarProps {
  activeTab: VehicleDetailTab;
  onTabChange: (tab: VehicleDetailTab) => void;
}

export function VehicleDetailTabBar({ activeTab, onTabChange }: VehicleDetailTabBarProps) {
  const { getTabProps } = useRovingTablist({
    items: VEHICLE_DETAIL_TAB_KEYS,
    activeId: activeTab,
    onActivate: onTabChange,
    getItemId: (tab) => VEHICLE_DETAIL_TAB_ID[tab],
    getPanelId: (tab) => VEHICLE_DETAIL_TAB_PANEL_ID[tab],
    orientation: 'horizontal',
  });

  return (
    <div className="mb-4 min-w-0 max-w-full">
      <div className={chromeTabBarClass('p-1')}>
        <div
          className={`${CHROME_TAB_BAR_SCROLL_CLASS} [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
          role="tablist"
          aria-label="Vehicle detail tabs"
          aria-orientation="horizontal"
        >
          {VEHICLE_DETAIL_TAB_KEYS.map((tab, index) => {
            const isActive = activeTab === tab;
            const tabProps = getTabProps(tab, index);
            const { ref, onKeyDown, onFocus, ...restTabProps } = tabProps;

            return (
              <button
                key={tab}
                type="button"
                {...restTabProps}
                ref={ref}
                onKeyDown={onKeyDown}
                onFocus={onFocus}
                className={cn(
                  chromeTabTriggerClass(isActive, VEHICLE_DETAIL_TAB_TRIGGER_CLASS),
                  'focus-visible:ring-2 focus-visible:ring-[var(--brand-soft)] focus-visible:ring-offset-2 motion-reduce:transition-none',
                )}
              >
                {VEHICLE_DETAIL_TAB_LABELS[tab]}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
